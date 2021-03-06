const { dialog } = require('electron');
const pdf = require('html-pdf');
const path = require('path');
const FileManager = require('./filesystem.manager');
const HttpServer = require('./previewServer/httpServer');
const jiff = require('jiff');
const os = require('os');
const open = require('open');

function assembleBufferPayload(request) {
  const requestPayload = (request.uploadData || [{ stringContent: () => '{}' }]);
  const stringData = requestPayload
    .map(data => data.stringContent())
    .reduce((data, curr) => data.concat(curr));
  return JSON.parse(stringData);
}

module.exports = class {

  static run(api, app) {
    const fileManager = new FileManager();
    const httpServer = new HttpServer();

    /**
     * Request Body
     * {
     *     filePath: 'absolute path to target file',
     *     fileName: 'name for the file',
     *     payload: 'html',
     *     metadata: 'pdf create opts'
     * }
     *
     * Response Body Payload
     * {
     *     created: 'boolean flag, false on error'
     * }
     */
    api.post('pdf', (request, response) => {
      const requestPayload = assembleBufferPayload(request);
      if(requestPayload.fileName && requestPayload.payload && requestPayload.metadata) {
        try{
          dialog.showSaveDialog(null, {
            defaultPath: app.getPath('documents') + '/' + requestPayload.fileName,
          }, file => {
            const style = /<style>(?:.|\n)*?<\/style>/.exec(requestPayload.payload)[0];
            const html = `<html><head>${style.replace(/{{__dirname}}/g, __dirname)}</head><body>${requestPayload.payload.replace(style, '')}</body></html>`;
            console.log(html);
            pdf.create(html, requestPayload.metadata).toFile(file, err => {
              response.json({
                status: !err ? 201 : 500,
                statusMessage: !err ? 'written file' : err.stack
              });
            });
          });
        } catch (err) {
          response.json({
            status: 500,
            statusMessage: 'Can\'t create PDF',
            payload: {
              created: false
            }
          });
        }
      } else {
        response.json({
          status: 400,
          statusMessage: 'Invalid Post Body',
          payload: {
            created: false
          }
        });
      }
    });

    /**
     * Request Body
     * {
     *     path: 'absolute path to directory
     * }
     *
     * Response Body Payload
     * [] Array of file system links to all song files
     */
    api.post('index', (request, response) => {
      const payload = assembleBufferPayload(request);
      if(payload.path) {
        try {
          const songLinks = fileManager
            .clearMap()
            .readDir(payload.path)
            .loadSongFiles()
            .listAllSongFiles();
          response.json({
            status: 200,
            statusMessage: 'All songs indexed',
            payload: songLinks
          });
        } catch (error) {
          response.json({
            status: 500,
            statusMessage: error.stack,
            payload: {}
          });
        }
      } else {
        response.json({
          status: 400,
          statusMessage: 'Invalid Post Body',
          payload: {}
        });
      }
    });

    api.get('index', (request, response) => {
      try {
        const songLinks =  Array.from(fileManager.loadSongFiles(), 
          map => Object.assign({}, { path: map[0], content: map[1] })
          );
        response.json({
          status: 200,
          statusMessage: 'All songs indexed',
          payload: songLinks
        });
      } catch (error) {
        response.json({
          status: 500,
          statusMessage: error.stack,
          payload: {}
        });
      }

    });
    

    /**
     * Request Body
     * {
     *     path: absolute path to the file
     *     payload: to be saved data
     * }
     *
     * No response payload. statuses
     * 201,
     * 400 on not saved because assumed your input data was wrong
     */
    api.post('file', (request, response) => {
      const payload = assembleBufferPayload(request);
      fileManager.writeFile(payload.path, payload.payload, (err) => {
        if(err) {
            response.json({
              status: 400,
              statusMessage: ['Could not create file', err.stack].join('\n See information: ')
            });
        }
        else {
          response.json({
            status: 201,
            statusMessage: 'Wrote file',
            payload: {}
          });
        }
      });
    });

    /**
     * Request Body
     * {
     *     path: absolute path to the file
     *     payload: to be saved data
     * }
     * Statuses
     * 201,
     * 300, when there have been changes since last load
     * 404 if the given path was not loaded before and a synch check is not possible
     *
     * Response Payload on 300
     * {
     *     currentVersion: version from current file
     * }
     */
    api.post('file/sync', (request, response) => {
      const payload = assembleBufferPayload(request);
      if(fileManager.isIndexed(payload.path)) {
        try {
          const indexedFile = fileManager.getIndexedVersion(payload.path);
          const currentFile = fileManager.loadFile(payload.path);
          const diff = jiff.diff(currentFile, indexedFile);
          if(diff.length === 0) {
            fileManager.writeFile(payload.path, payload.payload, () => {});
            response.json({
              status: 201,
              statusMessage: 'File was saved without conflicts',
              payload: {}
            });
          } else {
            response.json({
              status: 300,
              statusMessage: 'The file has been modified without being reloaded',
              payload: {
                currentVersion: currentFile,
                indexedVersion: indexedFile
              }
            });
          }
        } catch (err) {
          response.json({
            status: 500,
            statusMessage: ['An error occurred while loading file', err.stack].join('\n See information: ')
          });
        }
      } else {
        response.json({
          status: 404,
          statusMessage: 'The given resource has not been initialized',
          payload: {}
        });
      }
    });

    /**
     * Request Body
     * {
     *     path: absolute path to the file
     * }
     * No response payload. statuses
     * 200,
     * 400 on not saved because assumed your input data was wrong,
     * 404 on not existing file
     */
    api.delete('file', (request, response) => {
      const payload = assembleBufferPayload(request);
      try {
        fileManager.deleteFile(payload.path)
        response.json({
          status: 200,
          statusMessage: '',
          payload: {}
        })
      } catch(err) {
        response.json({
          status: 404,
          statusMessage: err.stack,
          payload: {}
        });
      }
    });

    /**
     * Request Body
     * {
     *     path: path to file
     *     json?: if true it will return the file as json
     * }
     *
     * Response Body
     * {
     *     data: utf8 encoded string or json
     * }
     */
    api.post('read', (request, response) => {
      const payload = assembleBufferPayload(request);
      if(fileManager.exists(payload.path)) {
        const data = fileManager.loadFile(payload.path);
        response.json({
          status: 200,
          statusMessage: 'Resource loaded',
          payload: { data }
        });
      } else {
        response.json({
          status: 404,
          statusMessage: 'Given path does not exist or is not readable',
          payload: {}
        });
      }
    });

    /**
     * Request Body
     * {
     *     htmls: array of html strings for each song
     *     title: string (title for webpage)
     *     hostWidth: number
     *     hostHeight: number
     * }
     *
     * Response Body
     * {
     *    url: url of server
     * }
     */
    api.post('performserver/run', (request, response) => {
      const data = assembleBufferPayload(request);
      const ifaces = os.networkInterfaces();
      let host = '';

      if(ifaces['en0']){
        ifaces['en0'].forEach(function (iface) {
          if ('IPv4' !== iface.family || iface.internal !== false) {
            // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
            return;
          }
          host = iface.address;
        });
      } else {
        host = '172.20.42.42';
      }
      httpServer.run(host, data.htmls, data.title, data.hostWidth, data.hostHeight);
      res.send(JSON.stringify({ url: 'http://' + host + ':8080/' }))
    });

    /**
     * Request Body
     * {
     * }
     *
     * Response Body
     * {
     * }
     */
    api.get('performserver/stop', (request, response) => {
      httpServer.stop();
      response.send();
    });

    /**
     * Request Body
     * {
     *     blob: the blob data
     *     encoding: string of nodejs encoding
     *     fileName: string of default fileName
     * }
     *
     * Response Body
     * {
     * }
     */
    api.post('blob', (request, response) => {
      const payload = assembleBufferPayload(request);
      try {
        dialog.showSaveDialog(null, {
          defaultPath: app.getPath('documents') + '/' + payload.fileName,
        }, file => {
          if(file){
            fileManager.writeBlob(file, payload.blob, payload.encoding);
            response.json({
              status: 200,
              statusMessage: 'Created file',
              payload: {}
            });
          } else {
            response.json({
              status: 499,
              statusMessage: 'Request Canceled',
              payload: {}
            });
          }
        });
      } catch (err) {
        response.json({
          status: 500,
          statusMessage: 'Error while creating file',
          payload: {}
        });
      }
    });

    /**
     * Request Body
     * {
     *     url: string
     * }
     *
     * Response Body
     * { }
     */
    api.post('openurl', (request, response) => {
      const payload = assembleBufferPayload(request);
      try {
        open(payload.url);
        response.json({
          status: 200,
          statusMessage: 'Success',
          payload: {}
        })
      } catch (err) {
        response.json({
          status: 400,
          statusMessage: 'An url has to be specified',
          payload: {}
        });
      }
    })

  }
};

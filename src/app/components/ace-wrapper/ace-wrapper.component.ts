import { Component, ViewChild, Input, Output, ElementRef, EventEmitter, OnInit, OnChanges, HostListener, OnDestroy } from '@angular/core';
import { Song } from '../../models/song';
import { ParserService } from '../../services/parser.service';
import { MUSICAL_KEYS } from '../../models/keys';
import { KeyFinderService } from '../../services/keyFinder.service';

@Component({
  selector: 'app-ace-wrapper',
  templateUrl: './ace-wrapper.component.html',
  styleUrls: ['./ace-wrapper.component.scss']
})
export class AceWrapperComponent implements OnChanges {

  @ViewChild('textfield') textfield;
  @ViewChild('content', {read: ElementRef}) content: ElementRef;
  aceOptions = {
    wrap: true,
    fontSize: 12,
    showPrintMargin: false
  };

  songHasChanged = true;
  initText = '';

  @Input() song: Song;
  @Output() songChange = new EventEmitter<Song>();

  constructor(
    private parserService: ParserService,
    private keyFinder: KeyFinderService
  ) { }

  ngOnChanges() {
    if (this.song && !this.song.text) {
      this.song.text = this.parserService.songToString(this.song);
      this.initText = this.song.text;
    } else if (this.song && this.initText !== this.song.text) {
      this.initText = this.song.text;
    }
  }

  public emitSongChangeEvent() {
    const songID = this.song.id;
    this.song = this.parserService.stringToSong(this.initText);
    this.song.id = songID;
    this.songHasChanged = true;
    this.songChange.emit(this.song);
  }

  public transposeUp() {
    this.song.transposedBy = (this.song.transposedBy + 1) % 12;
    this.song.transposedBy = 1;
    this.transpose();
  }

  public transposeDown() {
    this.song.transposedBy = (this.song.transposedBy - 1) % 12;
    this.song.transposedBy = -1;
    this.transpose();
  }

  private transpose() {
    const res = this.keyFinder.getKeys(this.song.text);
    const matches: RegExpExecArray[] = res.matches;
    const flat = res.flat;

    matches.reverse().forEach(m => {
      // if there is no extra basenote
      if (!m[2]) {
        this.song.text = this.song.text.substr(0, m.index) +
                        '[' + this.getNewChord(m[1], flat) + ']' +
                        this.song.text.substr(m.index + m[0].length);
      } else {
        this.song.text = this.song.text.substr(0, m.index) +
                        '[' + this.getNewChord(m[1], flat) + '/' +
                        this.getNewChord(m[2], flat) + ']' +
                        this.song.text.substr(m.index + m[0].length);
      }
    });
  }

  private getNewChord(chord, flat) {
    let mainKey = chord[0].toLowerCase();
    let firstTwo = false;
    const chordStr = chord[1];
    if (chordStr && (chordStr.toLowerCase() === '#' || chordStr.toLowerCase() === 'b')) {
      mainKey += chordStr.toLowerCase();
      firstTwo = true;
    }

    let id = -1;
    if (flat) {
      id = MUSICAL_KEYS.flats.findIndex(val => val.toLowerCase() === mainKey);
    } else {
      id = MUSICAL_KEYS.sharps.findIndex(val => val.toLowerCase() === mainKey);
    }

    if (id > -1) {
      let newMainKey;
      const newId = (id + this.song.transposedBy + 12) % 12;
      if (flat) {
        newMainKey = MUSICAL_KEYS.flats[newId];
      } else {
        newMainKey = MUSICAL_KEYS.sharps[newId];
      }

      if (firstTwo) {
        chord = newMainKey + chord.substr(2);
      } else {
        chord = newMainKey + chord.substr(1);
      }
    }
    return chord;
  }

  public getStepsString() {
    let str = this.song.transposedBy > 0 ? '+' : '';
    str = this.song.transposedBy < 0 ? '-' : '';
    str += this.song.transposedBy > 9 || this.song.transposedBy < -9 ? '' : ' ';
    str += this.song.transposedBy < 0 ? this.song.transposedBy * -1 : this.song.transposedBy;
    return str;
  }

}

import { Component, OnInit, HostListener, Output, EventEmitter, Input, OnChanges, ViewChild, ElementRef } from '@angular/core';
import { FormGroup, FormBuilder } from '@angular/forms';
import { HtmlFactoryService } from '../../services/html-factory.service';
import { ParserService } from '../../services/parser.service';
import { Song } from '../../models/song';

const enum KEYS {
  openBracket = 91,
  backspace = 8,
  star = 42
}

@Component({
  selector: 'app-songsheet-textarea',
  templateUrl: './songsheet-textarea.component.html',
  styleUrls: ['./songsheet-textarea.component.scss']
})
export class SongsheetTextareaComponent implements OnInit, OnChanges {

  @Input() input: Song;
  @Output() value: EventEmitter<Song> = new EventEmitter<Song>();

  @ViewChild('textfield') textfield: ElementRef;

  song: Song = new Song();
  inputGroup: FormGroup;
  htmlLines: string[] = [];

  start: number;
  end: number;

  constructor(
    private fb: FormBuilder,
    private htmlFactory: HtmlFactoryService,
    private parser: ParserService
  ) {
    this.inputGroup = this.fb.group({
      'inputControl': [null]
    });
  }

  ngOnInit() {
    this.update('');
    this.inputGroup.get('inputControl').valueChanges.subscribe((v) => {
        this.update(v);
        this.song = this.parser.str2Obj(v);
        this.value.emit(this.song);
    });
  }
  ngOnChanges() {
    if (this.input) {
      this.song = this.input;
      this.inputGroup.get('inputControl').setValue(this.parser.obj2Str(this.song));
    }
  }

  private update(inputText: string) {
    this.htmlLines = this.htmlFactory.highlightText(inputText);
  }

  @HostListener('keypress', ['$event.keyCode', '$event.target'])
  autocomplete(keyCode, target) {
    this.start = target.selectionStart;
    this.end = target.selectionEnd;

    if (keyCode === KEYS.openBracket || keyCode === KEYS.star) {
      const text = target.value;
      const charPos = target.selectionStart;
      let insert = '';

      switch (keyCode) {
        case KEYS.openBracket:
          if (text.substr(charPos, 1) !== ']' || this.countBefore(text, '[', charPos) === this.countAfter(text, ']', charPos)) {
            insert = ']';
          }
          break;
        case KEYS.star:
          if (text.substr(charPos, 1) !== '*' || this.countBefore(text, '*', charPos) === this.countAfter(text, '*', charPos)) {
            insert = '*';
          }
          break;
      }

      target.value = text.substr(0, charPos) + insert + text.substr(charPos);
      target.selectionStart = charPos;
      target.selectionEnd = charPos;
    }
  }

  @HostListener('keydown', ['$event.keyCode', '$event.target'])
  backspace(keyCode, target) {
    if (keyCode !== KEYS.backspace) {
      return;
    }

    const text = target.value;
    const charPos = target.selectionStart;

    // if backspace was pressed delete '[' or '*' if they are doubled like and space is in between [|] or *|*
    if (target.selectionStart === target.selectionEnd) {

      let remove = 0;

      switch (text.charAt(charPos - 1)) {
        case '[':
          if (text.charAt(charPos) === ']') {
            remove = 1;
          }
          break;
        case '*':
          if (text.charAt(charPos) === '*') {
            remove = 1;
          }
          break;
      }

      target.value = text.substr(0, charPos) + text.substr(charPos + remove);
      target.selectionStart = charPos;
      target.selectionEnd = charPos;

    // if area is selected and shall be deleted
    }
}

  private countBefore(string, symbol, selectPos) {
    let i = 0;
    for ( ; string.charAt(selectPos - i - 1) === symbol; i++) { }
    return i;
  }
  private countAfter(string, symbol, selectPos) {
    let i = 0;
    for ( ; string.charAt(selectPos + i) === symbol; i++) { }
    return i;
  }

  /*public addResolveSymbol() {
    const value = this.textfield.nativeElement.value;

    this.textfield.nativeElement.value = value.substr(0, this.start) + '♮' + value.substr(this.end);
    this.textfield.nativeElement.selectionEnd = this.start;
  }*/

}

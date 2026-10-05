import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration, drawSelection, EditorView, gutter, GutterMarker, keymap, lineNumbers, type DecorationSet,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Diagnostic } from './lang';

// Keywords bold black, numbers and strings dark blue, comments pencil.
// That's the whole theme.
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.standard(tags.typeName), tags.bool, tags.processingInstruction], fontWeight: 'bold' },
  { tag: [tags.number, tags.string], color: '#1a4d8f' },
  { tag: tags.comment, color: 'var(--pencil)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--paper)', color: 'var(--ink)' },
  '.cm-scroller': { fontFamily: 'Consolas, "Courier New", monospace', fontSize: '14px', lineHeight: '1.4' },
  '.cm-gutters': { backgroundColor: 'var(--paper)', color: 'var(--pencil)', border: 'none' },
  '.cm-exec-line': { backgroundColor: 'var(--highlighter)' },
  '.cm-error-token': { textDecoration: 'underline wavy var(--redpen)', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' },
  '.cm-error-gutter': { width: '3px', paddingRight: '3px' },
  '.cm-error-bar': { backgroundColor: 'var(--redpen)', width: '3px', height: '100%' },
});

// ---- executing line (highlighter) ----

const setExecLine = StateEffect.define<number | null>();

const execLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setExecLine)) continue;
      if (e.value === null || e.value > tr.state.doc.lines) return Decoration.none;
      const line = tr.state.doc.line(e.value);
      return Decoration.set([Decoration.line({ class: 'cm-exec-line' }).range(line.from)]);
    }
    return tr.docChanged ? Decoration.none : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---- error (red gutter bar + wavy underline) ----

interface ErrorMark {
  line: number;
  from: number;
  to: number;
}

const setError = StateEffect.define<ErrorMark | null>();

const errorField = StateField.define<ErrorMark | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setError)) return e.value;
    return tr.docChanged ? null : value; // positions are stale once the code changes
  },
});

const errorUnderline = EditorView.decorations.compute([errorField], (state) => {
  const err = state.field(errorField);
  if (!err || err.from >= err.to || err.to > state.doc.length) return Decoration.none;
  const b = new RangeSetBuilder<Decoration>();
  b.add(err.from, err.to, Decoration.mark({ class: 'cm-error-token' }));
  return b.finish();
});

class ErrorBar extends GutterMarker {
  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-error-bar';
    return el;
  }
}
const errorBar = new ErrorBar();

const errorGutter = gutter({
  class: 'cm-error-gutter',
  lineMarker(view, block) {
    const err = view.state.field(errorField);
    return err && view.state.doc.lineAt(block.from).number === err.line ? errorBar : null;
  },
  lineMarkerChange: (u) => u.startState.field(errorField) !== u.state.field(errorField),
});

export interface Editor {
  getCode(): string;
  load(code: string): void; // new document with fresh undo history
  replace(code: string): void; // undoable with Ctrl+Z
  highlightLine(line: number | null): void;
  showError(d: Diagnostic | null): void;
  focus(): void;
}

export function createEditor(parent: HTMLElement, code: string, hooks: { onRun: () => void; onChange: () => void }): Editor {
  const extensions = [
    lineNumbers(),
    errorGutter,
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    EditorState.tabSize.of(2),
    keymap.of([
      { key: 'Mod-Enter', run: () => (hooks.onRun(), true) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    cpp(),
    syntaxHighlighting(highlight),
    theme,
    execLine,
    errorField,
    errorUnderline,
    EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) hooks.onChange();
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc: code, extensions }) });

  return {
    getCode: () => view.state.doc.toString(),
    load(code) {
      view.setState(EditorState.create({ doc: code, extensions }));
    },
    replace(code) {
      // Its own undo step, so Ctrl+Z restores exactly what was there.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
        annotations: isolateHistory.of('full'),
      });
    },
    highlightLine(line) {
      const effects: StateEffect<unknown>[] = [setExecLine.of(line)];
      if (line !== null && line <= view.state.doc.lines) {
        effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'nearest' }));
      }
      view.dispatch({ effects });
    },
    showError(d) {
      if (!d || d.line === null || d.line > view.state.doc.lines) {
        view.dispatch({ effects: setError.of(null) });
        return;
      }
      const line = view.state.doc.line(d.line);
      let from = d.from ?? line.from;
      let to = d.to ?? line.to;
      // Underline at least something visible on the error line.
      if (from >= to || from < line.from || from > line.to) {
        from = line.from + (line.text.length - line.text.trimStart().length);
        to = line.to;
      }
      view.dispatch({
        effects: [setError.of({ line: d.line, from, to }), EditorView.scrollIntoView(line.from, { y: 'nearest' })],
      });
    },
    focus: () => view.focus(),
  };
}

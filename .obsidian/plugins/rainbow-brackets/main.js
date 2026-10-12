// Rainbow Brackets — an Obsidian plugin.
// In the editor (Live Preview and Source mode) it:
//   1. Colors () [] {} by nesting depth (colors cycle).
//   2. Highlights the pair of the bracket next to the cursor.
//   3. Marks brackets without a pair in red.
// Brackets inside code (`...`, ```...```), math ($...$) and frontmatter are ignored.
//
// Plain JS, no build step: Obsidian provides 'obsidian' and '@codemirror/*'
// to plugins through require, so no bundler is needed.

const { Plugin } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');
const { syntaxTree } = require('@codemirror/language');

// Opening and closing brackets. The index in the string is the bracket "type",
// so '(' and ')' share type 0, '[' and ']' type 1, '{' and '}' type 2.
const OPEN = '([{';
const CLOSE = ')]}';

// Number of cycling colors. Must match the rb-depth-N classes in styles.css.
const LEVELS = 4;

// Ordered list markers like "1) ...", "a) ...", "б) ..." at the start of a line.
// Their ')' is not a bracket, otherwise every such item would be flagged as unmatched.
const LIST_MARKER = /^\s*(\d+|[a-zA-Zа-яА-ЯёЁ])\)$/;

// Syntax tree nodes whose brackets are ignored: inline code, code blocks, math, frontmatter.
// Obsidian names them e.g. "inline-code", "hmd-codeblock", "math", "hmd-frontmatter".
const SKIP_NODE = /code|math|frontmatter/i;

// Collects [from, to) ranges where brackets must not be analyzed.
// Obsidian's markdown tree is flat (tokens follow each other), so the ranges
// come out sorted by `from`, which lets analyze() walk them in a single pass.
function collectSkipRanges(state) {
	const ranges = [];
	syntaxTree(state).iterate({
		enter(node) {
			if (SKIP_NODE.test(node.name)) {
				ranges.push([node.from, node.to]);
				return false; // the whole node is skipped, no need to descend
			}
		},
	});
	return ranges;
}

// Main pass: walks the whole document and finds every bracket.
// Returns an array of items sorted by position:
//   pos     — position of the bracket character in the document
//   depth   — nesting depth (selects the color)
//   partner — index of the matching bracket in the same array, or -1 if unmatched
function analyze(state) {
	const text = state.doc.toString();
	const skip = collectSkipRanges(state);
	let si = 0;              // current skip range (walked in parallel with the text)
	let lineStart = 0;       // start of the current line, for the list marker check
	const items = [];
	const stack = [];        // indices of opening brackets that are still open

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\n') { lineStart = i + 1; continue; }

		const o = OPEN.indexOf(ch);
		const c = CLOSE.indexOf(ch);
		if (o < 0 && c < 0) continue;

		// Skip brackets inside code / math / frontmatter
		while (si < skip.length && skip[si][1] <= i) si++;
		if (si < skip.length && skip[si][0] <= i) continue;

		// An escaped "\(" in Markdown is a literal character, not a bracket
		if (i > 0 && text[i - 1] === '\\') continue;

		if (o >= 0) {
			// Opening bracket: depth = how many brackets are currently open
			items.push({ pos: i, depth: stack.length, partner: -1, type: o });
			stack.push(items.length - 1);
			continue;
		}

		// ')' of a list marker "1)" is not a bracket.
		// The text from line start up to this ')' must be exactly the marker,
		// followed by whitespace or end of text.
		if (ch === ')' && LIST_MARKER.test(text.slice(lineStart, i + 1))
			&& (i + 1 >= text.length || /\s/.test(text[i + 1]))) continue;

		const item = { pos: i, depth: stack.length, partner: -1, type: c };
		items.push(item);
		const idx = items.length - 1;

		// Find the nearest open bracket of the same type.
		// E.g. in "[ ( ]" the ']' matches '[' and the '(' in between stays unmatched.
		let k = stack.length - 1;
		while (k >= 0 && items[stack[k]].type !== c) k--;
		if (k < 0) continue; // no pair: partner stays -1, the bracket turns red

		// Everything opened above the match is dropped from the stack
		// and keeps partner = -1, i.e. stays unmatched.
		stack.length = k + 1;
		const oi = stack.pop();
		items[oi].partner = idx;
		item.partner = oi;
		item.depth = items[oi].depth; // both brackets of a pair share a color
	}
	// Openers left on the stack at the end are unmatched too (partner = -1).
	return items;
}

// Binary search: index of the first item with pos >= target.
function lowerBound(items, target) {
	let lo = 0, hi = items.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (items[mid].pos < target) lo = mid + 1; else hi = mid;
	}
	return lo;
}

// Decorations cached by class string, so we don't create an object per character.
const markCache = new Map();
function markFor(cls) {
	let m = markCache.get(cls);
	if (!m) { m = Decoration.mark({ class: cls }); markCache.set(cls, m); }
	return m;
}

const bracketsView = ViewPlugin.fromClass(class {
	constructor(view) {
		this.items = analyze(view.state);
		this.decorations = this.build(view);
	}

	update(u) {
		// Obsidian parses the document incrementally, so recompute both when the text
		// changes and when the parser updates the tree (code/math ranges may shift).
		const treeChanged = syntaxTree(u.startState) !== syntaxTree(u.state);
		if (u.docChanged || treeChanged) this.items = analyze(u.state);
		if (u.docChanged || treeChanged || u.viewportChanged || u.selectionSet) {
			this.decorations = this.build(u.view);
		}
	}

	build(view) {
		const items = this.items;

		// Look for a bracket next to the cursor: first to the left (just typed),
		// then to the right. Highlight it and its pair.
		const active = new Set();
		const head = view.state.selection.main.head;
		for (const p of [head - 1, head]) {
			const j = lowerBound(items, p);
			if (j < items.length && items[j].pos === p) {
				active.add(j);
				if (items[j].partner >= 0) active.add(items[j].partner);
				break;
			}
		}

		// Decorate only the visible part of the document — fast even on large notes.
		const builder = new RangeSetBuilder();
		for (const { from, to } of view.visibleRanges) {
			for (let j = lowerBound(items, from); j < items.length && items[j].pos < to; j++) {
				const it = items[j];
				let cls = it.partner < 0
					? 'rb-bracket rb-unmatched'
					: 'rb-bracket rb-depth-' + (it.depth % LEVELS);
				if (active.has(j)) cls += ' rb-active';
				builder.add(it.pos, it.pos + 1, markFor(cls));
			}
		}
		return builder.finish();
	}
}, {
	decorations: (v) => v.decorations,
});

module.exports = class RainbowBracketsPlugin extends Plugin {
	onload() {
		// Attach the extension to every Obsidian editor
		this.registerEditorExtension(bracketsView);
	}
};

// Exported for the unit tests in test/ (not used by Obsidian)
module.exports.analyze = analyze;

/* nosourcemap */
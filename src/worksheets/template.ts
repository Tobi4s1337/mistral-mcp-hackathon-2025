export const WORKSHEET_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
/* Global Reset and Base Styles */
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 11pt;
  line-height: 1.4;
  color: #000;
  background: white;
  max-width: 8.5in;
  margin: 0 auto;
  padding: 0.5in;
  padding-top: 70px; /* Extra space for logo */
}

/* Print Optimization */
@media print {
  body { margin: 0; padding: 0.25in; padding-top: 70px; }
  .no-break { page-break-inside: avoid; }
  .page-break { page-break-after: always; }
}

/* Typography */
.ws-title {
  font-size: 18pt;
  font-weight: bold;
  text-align: center;
  margin-bottom: 8pt;
  border-bottom: 2px solid #000;
  padding-bottom: 4pt;
}

.ws-subtitle {
  text-align: center;
  font-size: 10pt;
  color: #444;
  margin-bottom: 12pt;
}

.ws-section {
  margin-bottom: 16pt;
  page-break-inside: avoid;
}

.ws-section-title {
  font-size: 14pt;
  font-weight: bold;
  margin-bottom: 8pt;
  padding: 3pt 0;
  border-bottom: 1px solid #333;
}

.ws-instructions {
  font-style: italic;
  font-size: 10pt;
  margin-bottom: 8pt;
  color: #333;
}

/* Question Styles */
.q-item {
  margin-bottom: 12pt;
  page-break-inside: avoid;
}

.q-num {
  font-weight: bold;
  display: inline-block;
  min-width: 24pt;
}

.q-text {
  font-size: 11pt;
  margin-bottom: 4pt;
}

/* Fill in the Blanks */
.fill-blank {
  display: inline-block;
  border-bottom: 1px solid #000;
  min-width: 60pt;
  margin: 0 2pt;
  vertical-align: bottom;
}

.fill-blank-long {
  display: inline-block;
  border-bottom: 1px solid #000;
  min-width: 120pt;
  margin: 0 2pt;
  vertical-align: bottom;
}

/* Answer Lines */
.answer-line {
  border-bottom: 1px solid #666;
  height: 18pt;
  margin: 3pt 0 3pt 24pt;
}

.answer-lines-2 { margin-left: 24pt; }
.answer-lines-2 .answer-line { margin: 3pt 0; }

.answer-lines-3 { margin-left: 24pt; }
.answer-lines-3 .answer-line { margin: 3pt 0; }

.answer-lines-5 { margin-left: 24pt; }
.answer-lines-5 .answer-line { margin: 3pt 0; }

/* Multiple Choice */
.mc-options {
  margin-left: 24pt;
  margin-top: 4pt;
}

.mc-option {
  margin: 3pt 0;
  font-size: 10pt;
}

.mc-letter {
  display: inline-block;
  width: 20pt;
  font-weight: bold;
}

.mc-circle {
  display: inline-block;
  width: 12pt;
  height: 12pt;
  border: 1px solid #000;
  border-radius: 50%;
  margin-right: 6pt;
  vertical-align: middle;
}

/* True/False */
.tf-options {
  display: inline-block;
  margin-left: 12pt;
  font-size: 10pt;
}

.tf-circle {
  display: inline-block;
  width: 10pt;
  height: 10pt;
  border: 1px solid #000;
  border-radius: 50%;
  margin: 0 3pt;
  vertical-align: middle;
}

/* Matching */
.match-container {
  display: flex;
  gap: 20pt;
  margin-left: 24pt;
  margin-top: 6pt;
}

.match-column {
  flex: 1;
}

.match-item {
  margin: 4pt 0;
  padding: 2pt 0;
  font-size: 10pt;
}

.match-left {
  padding-right: 8pt;
}

.match-left::before {
  content: "_____ ";
  margin-right: 4pt;
}

.match-right::before {
  content: attr(data-letter) ". ";
  font-weight: bold;
}

/* Tables */
.ws-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0;
  font-size: 10pt;
}

.ws-table th,
.ws-table td {
  border: 1px solid #000;
  padding: 3pt 6pt;
  text-align: left;
}

.ws-table th {
  background-color: #f0f0f0;
  font-weight: bold;
}

.ws-table td.blank {
  min-height: 18pt;
}

/* Math Work Box */
.math-box {
  border: 1px solid #666;
  min-height: 72pt;
  padding: 6pt;
  margin: 6pt 0 6pt 24pt;
  position: relative;
}

.math-box-small {
  min-height: 48pt;
}

.math-box-large {
  min-height: 120pt;
}

.show-work-label {
  position: absolute;
  top: 3pt;
  left: 6pt;
  font-size: 8pt;
  color: #666;
  font-style: italic;
}

/* Essay/Extended Response */
.essay-box {
  margin-left: 24pt;
  margin-top: 6pt;
}

.essay-lines {
  background-image: repeating-linear-gradient(
    transparent,
    transparent 17pt,
    #666 17pt,
    #666 18pt
  );
  min-height: 90pt;
  padding-top: 2pt;
}

.essay-lines-small {
  min-height: 54pt;
}

.essay-lines-large {
  min-height: 144pt;
}

/* Vocabulary */
.vocab-item {
  margin-bottom: 8pt;
  padding-left: 24pt;
}

.vocab-word {
  font-weight: bold;
  font-size: 11pt;
}

.vocab-def-line {
  border-bottom: 1px solid #666;
  height: 16pt;
  margin: 2pt 0;
}

/* Sequencing */
.seq-container {
  margin-left: 24pt;
  counter-reset: seq-counter;
}

.seq-item {
  margin: 6pt 0;
  padding: 4pt 8pt;
  border: 1px solid #666;
  font-size: 10pt;
  position: relative;
}

.seq-item::before {
  counter-increment: seq-counter;
  content: counter(seq-counter) ". ";
  position: absolute;
  left: -20pt;
  font-weight: bold;
}

.seq-blank {
  width: 20pt;
  height: 20pt;
  border: 1px solid #000;
  display: inline-block;
  margin-right: 8pt;
  text-align: center;
  line-height: 20pt;
}

/* Word Problems */
.word-problem {
  margin-bottom: 12pt;
  padding-left: 24pt;
}

.word-problem-text {
  margin-bottom: 6pt;
  font-size: 10pt;
  line-height: 1.5;
}

.solution-space {
  border: 1px solid #666;
  min-height: 60pt;
  padding: 6pt;
  margin-top: 4pt;
}

/* Charts and Graphs */
.graph-grid {
  border: 1px solid #000;
  background-image:
    repeating-linear-gradient(0deg, #ddd, #ddd 1px, transparent 1px, transparent 10pt),
    repeating-linear-gradient(90deg, #ddd, #ddd 1px, transparent 1px, transparent 10pt);
  min-height: 120pt;
  margin: 8pt 0;
}

/* Reading Comprehension */
.reading-passage {
  border-left: 3px solid #666;
  padding-left: 12pt;
  margin: 8pt 0;
  font-size: 10pt;
  line-height: 1.6;
}

/* Special Elements */
.highlight-box {
  border: 2px solid #000;
  padding: 6pt;
  margin: 8pt 0;
  background-color: #f9f9f9;
}

.reminder-box {
  border: 1px dashed #666;
  padding: 4pt;
  margin: 6pt 0;
  font-size: 9pt;
  font-style: italic;
}

/* Utility Classes */
.center { text-align: center; }
.right { text-align: right; }
.bold { font-weight: bold; }
.italic { font-style: italic; }
.underline { text-decoration: underline; }
.small-text { font-size: 9pt; }
.large-text { font-size: 12pt; }
.spacing-small { margin-bottom: 4pt; }
.spacing-medium { margin-bottom: 8pt; }
.spacing-large { margin-bottom: 16pt; }
.indent { margin-left: 24pt; }
.no-wrap { white-space: nowrap; }
</style>
</head>
<body>
<h1 class="ws-title">__WORKSHEET_TITLE__</h1>
<p class="ws-subtitle">__WORKSHEET_SUBTITLE__</p>
__WORKSHEET_CONTENT__
</body>
</html>`;

export const CSS_CLASS_REFERENCE = {
  structure: {
    'ws-title': 'Main worksheet title',
    'ws-subtitle': 'Subtitle or meta information',
    'ws-section': 'Section container',
    'ws-section-title': 'Section heading',
    'ws-instructions': 'Instructions for a section or question'
  },
  questions: {
    'q-item': 'Question container',
    'q-num': 'Question number',
    'q-text': 'Question text'
  },
  fillBlanks: {
    'fill-blank': 'Short blank line (60pt)',
    'fill-blank-long': 'Long blank line (120pt)'
  },
  answerLines: {
    'answer-line': 'Single answer line',
    'answer-lines-2': 'Container for 2 answer lines',
    'answer-lines-3': 'Container for 3 answer lines',
    'answer-lines-5': 'Container for 5 answer lines'
  },
  multipleChoice: {
    'mc-options': 'Multiple choice options container',
    'mc-option': 'Individual option',
    'mc-letter': 'Option letter (A, B, C, etc.)',
    'mc-circle': 'Circle checkbox for selection'
  },
  trueFalse: {
    'tf-options': 'True/False options container',
    'tf-circle': 'Circle for T/F selection'
  },
  matching: {
    'match-container': 'Matching columns container',
    'match-column': 'Individual column',
    'match-item': 'Matching item',
    'match-left': 'Left column item (with blank)',
    'match-right': 'Right column item (with letter)'
  },
  tables: {
    'ws-table': 'Table element',
    'blank': 'Empty cell for student input'
  },
  math: {
    'math-box': 'Work area for calculations',
    'math-box-small': 'Small work area (48pt)',
    'math-box-large': 'Large work area (120pt)',
    'show-work-label': 'Label for work area'
  },
  essay: {
    'essay-box': 'Essay response container',
    'essay-lines': 'Lined area for writing',
    'essay-lines-small': 'Small essay area (54pt)',
    'essay-lines-large': 'Large essay area (144pt)'
  },
  vocabulary: {
    'vocab-item': 'Vocabulary term container',
    'vocab-word': 'Vocabulary word',
    'vocab-def-line': 'Line for definition'
  },
  sequencing: {
    'seq-container': 'Sequencing items container',
    'seq-item': 'Individual sequence item',
    'seq-blank': 'Blank box for sequence number'
  },
  wordProblems: {
    'word-problem': 'Word problem container',
    'word-problem-text': 'Problem description text',
    'solution-space': 'Space for solution work'
  },
  special: {
    'reading-passage': 'Reading comprehension passage',
    'graph-grid': 'Grid for drawing graphs',
    'highlight-box': 'Important information box',
    'reminder-box': 'Reminder or tip box'
  },
  utility: {
    'center': 'Center text',
    'bold': 'Bold text',
    'italic': 'Italic text',
    'small-text': 'Small font (9pt)',
    'large-text': 'Large font (12pt)',
    'spacing-small': 'Small bottom margin',
    'spacing-medium': 'Medium bottom margin',
    'spacing-large': 'Large bottom margin',
    'indent': 'Indent content',
    'no-break': 'Prevent page break',
    'page-break': 'Force page break'
  }
};
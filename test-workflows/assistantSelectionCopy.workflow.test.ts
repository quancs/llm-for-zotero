import { assert } from "chai";
import { isSelectionInsideReasoningPanel } from "../src/modules/contextPanel/setupHandlers/controllers/assistantSelectionPopupController";
import {
  getRenderedMathSelectionClipboardPayload,
  getSelectedTextWithinBubble,
} from "../src/modules/contextPanel/textUtils";

function katex(latex: string, visual = latex): string {
  return [
    '<span class="katex">',
    '<span class="katex-mathml">',
    `<math><semantics><mrow><mi>${visual}</mi></mrow>`,
    `<annotation encoding="application/x-tex">${latex}</annotation>`,
    "</semantics></math></span>",
    '<span class="katex-html" aria-hidden="true">',
    `<span class="base"><span class="mord">${visual}</span></span>`,
    "</span></span>",
  ].join("");
}

const selections = new WeakMap<Document, Selection>();

function makeBubble(markup: string): {
  doc: Document;
  bubble: HTMLElement;
  cleanup: () => void;
} {
  const chromeDoc = Zotero.getMainWindow().document;
  const doc = chromeDoc.implementation.createHTMLDocument("selection copy");
  Object.defineProperty(doc, "defaultView", {
    configurable: true,
    value: {
      getSelection: () => selections.get(doc) || null,
    },
  });
  doc.body.innerHTML = `<div id="bubble" class="llm-bubble assistant">${markup}</div>`;
  const bubble = doc.getElementById("bubble") as HTMLElement;
  return {
    doc,
    bubble,
    cleanup: () => {
      selections.delete(doc);
    },
  };
}

function selectRange(
  doc: Document,
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
): Selection {
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const selection = {
    anchorNode: range.startContainer,
    focusNode: range.endContainer,
    isCollapsed: range.collapsed,
    rangeCount: 1,
    getRangeAt: () => range,
  } as unknown as Selection;
  selections.set(doc, selection);
  return selection;
}

function selectContents(doc: Document, node: Node): Selection {
  const range = doc.createRange();
  range.selectNodeContents(node);
  const selection = {
    anchorNode: range.startContainer,
    focusNode: range.endContainer,
    isCollapsed: range.collapsed,
    rangeCount: 1,
    getRangeAt: () => range,
  } as unknown as Selection;
  selections.set(doc, selection);
  return selection;
}

describe("workflow: assistant selection math copy", function () {
  it("preserves prose surrounding a rendered formula", function () {
    const { doc, bubble, cleanup } = makeBubble(
      `<p>before ${katex("Z(x)")} after</p>`,
    );
    try {
      selectContents(doc, bubble);
      const annotation = bubble.querySelector(
        'annotation[encoding="application/x-tex"]',
      );
      assert.isOk(annotation, bubble.innerHTML);

      const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

      assert.equal(
        payload?.plainText,
        "before $Z(x)$ after",
        JSON.stringify({
          annotation: annotation?.outerHTML,
          renderedHtml: payload?.renderedHtml,
        }),
      );
      assert.include(payload?.renderedHtml || "", "before ");
      assert.include(payload?.renderedHtml || "", " after");
    } finally {
      cleanup();
    }
  });

  it("preserves paragraph breaks in a multi-block selection", function () {
    const { doc, bubble, cleanup } = makeBubble(
      [
        `<p>The normalization term is ${katex("Z(x)")}.</p>`,
        "<p>The second paragraph explains how it is derived.</p>",
      ].join(""),
    );
    try {
      const paragraphs = bubble.querySelectorAll("p");
      const firstText = paragraphs[0]!.firstChild!;
      const lastText = paragraphs[1]!.firstChild!;
      selectRange(doc, firstText, 0, lastText, lastText.textContent!.length);

      const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

      assert.equal(
        payload?.plainText,
        "The normalization term is $Z(x)$.\n\n" +
          "The second paragraph explains how it is derived.",
      );
    } finally {
      cleanup();
    }
  });

  it("preserves list items, hard breaks, and multiple formulas", function () {
    const { doc, bubble, cleanup } = makeBubble(
      `<ul><li>First ${katex("x")}</li>` +
        `<li>Second ${katex("y")}<br>continued</li></ul>`,
    );
    try {
      selectContents(doc, bubble);

      const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

      assert.equal(payload?.plainText, "First $x$\nSecond $y$\ncontinued");
    } finally {
      cleanup();
    }
  });

  it("expands a partial formula without dropping selected prose", function () {
    const { doc, bubble, cleanup } = makeBubble(
      `<p>before ${katex("Z(x)")} after</p>`,
    );
    try {
      const paragraph = bubble.querySelector("p")!;
      const beforeText = paragraph.firstChild!;
      const formulaText =
        bubble.querySelector(".katex-html .mord")!.firstChild!;
      selectRange(doc, beforeText, 0, formulaText, 1);

      const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

      assert.equal(payload?.plainText, "before $Z(x)$");
      assert.match(payload?.renderedHtml || "", /^before <span class="katex">/);
      assert.notInclude(payload?.renderedHtml || "", " after");
    } finally {
      cleanup();
    }
  });

  it("extracts selected TeX from Gecko DOM and scopes reasoning descendants", function () {
    const { doc, bubble, cleanup } = makeBubble(
      '<div class="llm-agent-reasoning"><span id="reason">hidden</span></div>' +
        `<p id="answer">before ${katex("Z(x)")} after</p>`,
    );
    try {
      const reasonText = bubble.querySelector("#reason")!.firstChild!;
      const answer = bubble.querySelector("#answer")!;
      const reasoningSelection = selectContents(doc, reasonText);
      assert.isTrue(isSelectionInsideReasoningPanel(reasoningSelection));

      const answerSelection = selectContents(doc, answer);
      assert.isFalse(isSelectionInsideReasoningPanel(answerSelection));
      assert.equal(
        getSelectedTextWithinBubble(doc, bubble),
        "before $Z(x)$ after",
      );
    } finally {
      cleanup();
    }
  });
});

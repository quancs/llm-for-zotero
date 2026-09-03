import { assert } from "chai";
import { JSDOM } from "jsdom";
import {
  copyRenderedMathSelectionToClipboard,
  isSelectionInsideReasoningPanel,
} from "../src/modules/contextPanel/setupHandlers/controllers/assistantSelectionPopupController";
import {
  getRenderedMathSelectionClipboardPayload,
  getSelectedTextWithinBubble,
} from "../src/modules/contextPanel/textUtils";

function makeClipboardEvent(): {
  event: ClipboardEvent;
  getPrevented: () => boolean;
  writes: Array<[string, string]>;
} {
  let prevented = false;
  const writes: Array<[string, string]> = [];
  const event = {
    clipboardData: {
      setData(type: string, value: string) {
        writes.push([type, value]);
      },
    },
    preventDefault() {
      prevented = true;
    },
  } as unknown as ClipboardEvent;
  return { event, getPrevented: () => prevented, writes };
}

function katex(latex: string, visual = latex, display = false): string {
  const displayAttribute = display ? ' display="block"' : "";
  return [
    '<span class="katex">',
    '<span class="katex-mathml">',
    `<math${displayAttribute}><semantics><mrow><mi>${visual}</mi></mrow>`,
    `<annotation encoding="application/x-tex">${latex}</annotation>`,
    "</semantics></math></span>",
    '<span class="katex-html" aria-hidden="true">',
    `<span class="base"><span class="mord">${visual}</span></span>`,
    "</span></span>",
  ].join("");
}

function makeBubble(markup: string): {
  dom: JSDOM;
  doc: Document;
  bubble: HTMLElement;
} {
  const dom = new JSDOM(
    `<!doctype html><body><div id="bubble" class="llm-bubble assistant">${markup}</div></body>`,
  );
  const doc = dom.window.document as unknown as Document;
  return {
    dom,
    doc,
    bubble: doc.getElementById("bubble") as HTMLElement,
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
  const selection = doc.defaultView?.getSelection();
  assert.exists(selection);
  selection!.removeAllRanges();
  selection!.addRange(range);
  return selection!;
}

function selectContents(doc: Document, node: Node): Selection {
  const range = doc.createRange();
  range.selectNodeContents(node);
  const selection = doc.defaultView?.getSelection();
  assert.exists(selection);
  selection!.removeAllRanges();
  selection!.addRange(range);
  return selection!;
}

describe("assistant selection math copy", function () {
  it("writes one TeX source while preserving rich HTML", function () {
    const clipboard = makeClipboardEvent();

    const handled = copyRenderedMathSelectionToClipboard(clipboard.event, {
      plainText: "所以先推导出 $Z(x)$，再归一化。",
      renderedHtml: '<span class="katex">Z(x)</span>',
    });

    assert.isTrue(handled);
    assert.isTrue(clipboard.getPrevented());
    assert.deepEqual(clipboard.writes, [
      ["text/html", '<span class="katex">Z(x)</span>'],
      ["text/plain", "所以先推导出 $Z(x)$，再归一化。"],
    ]);
  });

  it("leaves ordinary rich-text selections to the native copy path", function () {
    const clipboard = makeClipboardEvent();

    const handled = copyRenderedMathSelectionToClipboard(clipboard.event, null);

    assert.isFalse(handled);
    assert.isFalse(clipboard.getPrevented());
    assert.isEmpty(clipboard.writes);
  });

  it("preserves prose surrounding a rendered formula", function () {
    const { dom, doc, bubble } = makeBubble(
      `<p>before ${katex("Z(x)")} after</p>`,
    );
    selectContents(doc, bubble);

    const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

    assert.equal(payload?.plainText, "before $Z(x)$ after");
    assert.include(payload?.renderedHtml || "", "before ");
    assert.include(payload?.renderedHtml || "", " after");
    dom.window.close();
  });

  it("preserves paragraph breaks in a multi-block selection", function () {
    const { dom, doc, bubble } = makeBubble(
      [
        `<p>The normalization term is ${katex("Z(x)")}.</p>`,
        "<p>The second paragraph explains how it is derived.</p>",
      ].join(""),
    );
    selectContents(doc, bubble);

    const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

    assert.equal(
      payload?.plainText,
      "The normalization term is $Z(x)$.\n\n" +
        "The second paragraph explains how it is derived.",
    );
    dom.window.close();
  });

  it("preserves list items, hard breaks, and multiple formulas", function () {
    const { dom, doc, bubble } = makeBubble(
      `<ul><li>First ${katex("x")}</li>` +
        `<li>Second ${katex("y")}<br>continued</li></ul>`,
    );
    selectContents(doc, bubble);

    const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

    assert.equal(payload?.plainText, "First $x$\nSecond $y$\ncontinued");
    dom.window.close();
  });

  it("expands a partial formula selection without dropping preceding text", function () {
    const { dom, doc, bubble } = makeBubble(
      `<p>before ${katex("Z(x)")} after</p>`,
    );
    const paragraph = bubble.querySelector("p")!;
    const beforeText = paragraph.firstChild!;
    const formulaText = bubble.querySelector(".katex-html .mord")!.firstChild!;
    selectRange(doc, beforeText, 0, formulaText, 1);

    const payload = getRenderedMathSelectionClipboardPayload(doc, bubble);

    assert.equal(payload?.plainText, "before $Z(x)$");
    assert.match(payload?.renderedHtml || "", /^before <span class="katex">/);
    assert.notInclude(payload?.renderedHtml || "", " after");
    dom.window.close();
  });

  it("extracts selected TeX from a real DOM fragment", function () {
    const { dom, doc, bubble } = makeBubble(
      `<p>before ${katex("Z(x)")} after</p>`,
    );
    selectContents(doc, bubble);

    const selected = getSelectedTextWithinBubble(doc, bubble);

    assert.equal(selected, "before $Z(x)$ after");
    dom.window.close();
  });

  it("recognizes selections inside a reasoning descendant", function () {
    const { dom, doc } = makeBubble(
      '<div class="llm-agent-reasoning"><span id="reason">hidden</span></div>' +
        '<p id="answer">visible</p>',
    );
    const reasonText = doc.getElementById("reason")!.firstChild!;
    const answerText = doc.getElementById("answer")!.firstChild!;

    const reasoningSelection = selectContents(doc, reasonText);
    assert.isTrue(isSelectionInsideReasoningPanel(reasoningSelection));

    const answerSelection = selectContents(doc, answerText);
    assert.isFalse(isSelectionInsideReasoningPanel(answerSelection));
    dom.window.close();
  });
});

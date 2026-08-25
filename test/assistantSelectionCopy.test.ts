import { assert } from "chai";
import { copyRenderedMathSelectionToClipboard } from "../src/modules/contextPanel/setupHandlers/controllers/assistantSelectionPopupController";
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

  it("replaces a rendered KaTeX node with one LaTeX source", function () {
    const anchorNode = {} as Node;
    const textContainer = {
      textContent: "",
      appendChild() {},
      querySelector(selector: string) {
        return selector.includes(".katex") ? katexElement : null;
      },
      querySelectorAll(selector: string) {
        if (selector === ".katex") return [katexElement];
        return [];
      },
    };
    const annotation = {
      textContent: "Z(x)",
      closest() {
        return { getAttribute: () => null };
      },
    };
    const katexElement = {
      querySelector() {
        return annotation;
      },
      replaceWith(node: { textContent?: string }) {
        textContainer.textContent = node.textContent || "";
      },
    };
    const doc = {
      defaultView: {
        getSelection: () => ({
          anchorNode,
          focusNode: anchorNode,
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => ({ cloneContents: () => ({}) }),
        }),
      },
      createElement: () => textContainer,
      createTextNode: (text: string) => ({ textContent: text }),
    } as unknown as Document;
    const container = {
      contains: () => true,
    } as unknown as HTMLElement;

    const selected = getSelectedTextWithinBubble(doc, container);

    assert.equal(selected, "$Z(x)$");
  });

  it("mirrors KaTeX copy-tex and expands a partial formula selection", function () {
    let expandedStart = false;
    let expandedEnd = false;
    const katexElement = {} as Element;
    const formulaTextNode = {
      nodeType: 3,
      parentElement: {
        closest: () => katexElement,
      },
    } as unknown as Node;
    const annotation = {
      textContent: "Z(x)",
      closest: () => ({ getAttribute: () => null }),
    };
    const selectedKatex = {
      querySelector: () => annotation,
      replaceWith(node: { textContent?: string }) {
        textContainer.textContent = node.textContent || "";
      },
    };
    const textContainer = {
      textContent: "",
      appendChild() {},
      querySelector: () => selectedKatex,
      querySelectorAll(selector: string) {
        if (selector === ".katex") return [selectedKatex];
        return [];
      },
    };
    const fragment = {
      querySelector: () => ({}),
      childNodes: [
        { nodeType: 3, textContent: "before " },
        { nodeType: 1, outerHTML: '<span class="katex">Z(x)</span>' },
      ],
    };
    const clonedRange = {
      startContainer: formulaTextNode,
      endContainer: formulaTextNode,
      setStartBefore() {
        expandedStart = true;
      },
      setEndAfter() {
        expandedEnd = true;
      },
      cloneContents: () => fragment,
    };
    const doc = {
      defaultView: {
        getSelection: () => ({
          anchorNode: formulaTextNode,
          focusNode: formulaTextNode,
          isCollapsed: false,
          rangeCount: 1,
          getRangeAt: () => ({ cloneRange: () => clonedRange }),
        }),
      },
      createElement: () => textContainer,
      createTextNode: (text: string) => ({ textContent: text }),
    } as unknown as Document;
    const container = {
      contains: () => true,
    } as unknown as HTMLElement;

    const payload = getRenderedMathSelectionClipboardPayload(doc, container);

    assert.isTrue(expandedStart);
    assert.isTrue(expandedEnd);
    assert.deepEqual(payload, {
      plainText: "$Z(x)$",
      renderedHtml: 'before <span class="katex">Z(x)</span>',
    });
  });
});

import { assert } from "chai";
import { copyRenderedMathSelectionToClipboard } from "../src/modules/contextPanel/setupHandlers/controllers/assistantSelectionPopupController";

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
});

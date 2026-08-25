import { assert } from "chai";
import {
  noteHtmlToMarkdownText,
  stripNoteHtml,
} from "../src/modules/contextPanel/noteSnapshot";

describe("note snapshots", function () {
  it("preserves Zotero heading levels in the model-facing note text", function () {
    const html =
      '<div data-schema-version="9"><h1>Main &amp; title</h1><p>Intro</p><h2><strong>Details</strong></h2><p>Body</p><h6>Fine print</h6></div>';

    assert.equal(
      noteHtmlToMarkdownText(html),
      "# Main & title\n\nIntro\n\n## Details\n\nBody\n\n###### Fine print",
    );
  });

  it("keeps the plain-text stripper unchanged for comparison callers", function () {
    assert.equal(
      stripNoteHtml("<h1>Main</h1><h2>Details</h2>"),
      "Main\nDetails",
    );
  });
});

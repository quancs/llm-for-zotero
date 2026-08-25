import { assert } from "chai";
import { ZoteroGateway } from "../src/agent/services/zoteroGateway";

describe("ZoteroGateway current note edits", function () {
  const originalZotero = (
    globalThis as typeof globalThis & { Zotero?: unknown }
  ).Zotero;

  afterEach(function () {
    (globalThis as typeof globalThis & { Zotero?: unknown }).Zotero =
      originalZotero;
  });

  it("accepts note apply when the stored HTML is reserialized but the text is unchanged", async function () {
    let noteHtml = "<div><p>Original body</p></div>";
    let savedHtml = "";
    const noteItem = {
      id: 55,
      libraryID: 1,
      parentID: undefined,
      isNote: () => true,
      getNote: () => noteHtml,
      getDisplayTitle: () => "Draft Note",
      setNote: (html: string) => {
        savedHtml = html;
        noteHtml = html;
      },
      saveTx: async () => {},
    };

    (globalThis as typeof globalThis & { Zotero?: unknown }).Zotero = {
      Items: {
        get: (itemId: number) => (itemId === 55 ? noteItem : null),
      },
    };

    const gateway = new ZoteroGateway();
    const result = await gateway.replaceCurrentNote({
      request: {
        conversationKey: 7,
        mode: "agent",
        userText: "Update the note",
        activeNoteContext: {
          noteId: 55,
          title: "Draft Note",
          noteKind: "standalone",
          noteText: "Original body",
        },
      },
      content: "Updated body",
      expectedOriginalHtml: "<p>Original body</p>",
    });

    assert.equal(result.noteId, 55);
    assert.equal(result.nextText, "Updated body");
    assert.include(savedHtml, "Updated body");
  });

  it("accepts note apply when matching headings are present", async function () {
    let noteHtml =
      "<div><h1>Overview</h1><h2>Details</h2><p>Original body</p></div>";
    let savedHtml = "";
    const noteItem = {
      id: 56,
      libraryID: 1,
      parentID: undefined,
      isNote: () => true,
      getNote: () => noteHtml,
      getDisplayTitle: () => "Structured Note",
      setNote: (html: string) => {
        savedHtml = html;
        noteHtml = html;
      },
      saveTx: async () => {},
    };

    (globalThis as typeof globalThis & { Zotero?: unknown }).Zotero = {
      Items: {
        get: (itemId: number) => (itemId === 56 ? noteItem : null),
      },
    };

    const gateway = new ZoteroGateway();
    const result = await gateway.replaceCurrentNote({
      request: {
        conversationKey: 8,
        mode: "agent",
        userText: "Update the note",
        activeNoteContext: {
          noteId: 56,
          title: "Structured Note",
          noteKind: "standalone",
          noteText: "# Overview\n\n## Details\n\nOriginal body",
        },
      },
      content: "# Overview\n\n## Details\n\nUpdated body",
      expectedOriginalHtml:
        "<h1>Overview</h1><h2>Details</h2><p>Original body</p>",
    });

    assert.equal(result.noteId, 56);
    assert.include(result.previousText, "# Overview");
    assert.include(result.previousText, "## Details");
    assert.include(savedHtml, "<h1>Overview</h1>");
    assert.include(savedHtml, "<h2>Details</h2>");
  });

  it("still rejects an intervening heading-level change", async function () {
    const noteHtml = "<div><h2>Overview</h2><p>Original body</p></div>";
    const noteItem = {
      id: 57,
      libraryID: 1,
      parentID: undefined,
      isNote: () => true,
      getNote: () => noteHtml,
      getDisplayTitle: () => "Changed Note",
      setNote: () => {},
      saveTx: async () => {},
    };

    (globalThis as typeof globalThis & { Zotero?: unknown }).Zotero = {
      Items: {
        get: (itemId: number) => (itemId === 57 ? noteItem : null),
      },
    };

    const gateway = new ZoteroGateway();
    let caught: unknown;
    try {
      await gateway.replaceCurrentNote({
        request: {
          conversationKey: 9,
          mode: "agent",
          userText: "Update the note",
          activeNoteContext: {
            noteId: 57,
            title: "Changed Note",
            noteKind: "standalone",
            noteText: "# Overview\n\nOriginal body",
          },
        },
        content: "# Overview\n\nUpdated body",
        expectedOriginalHtml: "<h1>Overview</h1><p>Original body</p>",
      });
    } catch (error) {
      caught = error;
    }

    assert.instanceOf(caught, Error);
    assert.match(
      (caught as Error).message,
      /active note changed before this edit was applied/,
    );
  });
});

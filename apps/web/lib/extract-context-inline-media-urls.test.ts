import { describe, expect, it } from "vitest";
import { extractInlineHttpsImageUrls } from "./extract-context-inline-media-urls";

describe("extractInlineHttpsImageUrls", () => {
  it("parses markdown images", () => {
    expect(extractInlineHttpsImageUrls("See ![](https://ex.com/a.png) here")).toEqual([
      "https://ex.com/a.png",
    ]);
    expect(extractInlineHttpsImageUrls("![alt text](https://ex.com/b.jpg) end")).toEqual([
      "https://ex.com/b.jpg",
    ]);
  });

  it("parses img src double or single quotes", () => {
    expect(extractInlineHttpsImageUrls('<img src="https://cdn.example/x.png" />')).toEqual([
      "https://cdn.example/x.png",
    ]);
    expect(extractInlineHttpsImageUrls("<img class='x' src='https://y.com/z.gif'>")).toEqual([
      "https://y.com/z.gif",
    ]);
  });

  it("dedupes and keeps https only", () => {
    expect(
      extractInlineHttpsImageUrls("![](https://same.io/1.png) ![](https://same.io/1.png)"),
    ).toEqual(["https://same.io/1.png"]);
    expect(extractInlineHttpsImageUrls("![](ftp://x.com/a.png)")).toEqual([]);
  });
});

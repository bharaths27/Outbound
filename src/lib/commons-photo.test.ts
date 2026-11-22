import { describe, expect, it } from "vitest";
import { quests } from "@/lib/data/mock/content";
import { commonsFileName, commonsFilePage, parseCommonsCredit } from "./commons-photo";

describe("commonsFileName", () => {
  it("reads upload.wikimedia.org originals and thumbs", () => {
    expect(commonsFileName("https://upload.wikimedia.org/wikipedia/commons/4/4b/Faneuil_Hall%2C_Boston%2C_exterior.jpg")).toBe(
      "Faneuil_Hall,_Boston,_exterior.jpg",
    );
    expect(commonsFileName("https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Marsh_Chapel.jpg/960px-Marsh_Chapel.jpg")).toBe(
      "Marsh_Chapel.jpg",
    );
  });

  it("reads Special:FilePath links", () => {
    expect(commonsFileName("https://commons.wikimedia.org/wiki/Special:FilePath/Toscanini%27s,_Cambridge_MA.jpg?width=960")).toBe(
      "Toscanini's,_Cambridge_MA.jpg",
    );
  });

  it("ignores other hosts and empty values", () => {
    expect(commonsFileName("https://example.com/a.jpg")).toBeNull();
    expect(commonsFileName(null)).toBeNull();
    expect(commonsFileName("not a url")).toBeNull();
  });

  it("finds a Commons file for every seeded quest photo, so each one gets a credit", () => {
    for (const q of quests) expect(commonsFileName(q.photo_url), q.id).not.toBeNull();
  });
});

describe("parseCommonsCredit", () => {
  it("strips HTML from the artist and keeps the license", () => {
    const json = {
      query: {
        pages: {
          "1": {
            imageinfo: [
              {
                extmetadata: {
                  Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Jane &amp; Co</a>' },
                  LicenseShortName: { value: "CC BY-SA 4.0" },
                },
              },
            ],
          },
        },
      },
    };
    expect(parseCommonsCredit(json)).toEqual({ author: "Jane & Co", license: "CC BY-SA 4.0" });
  });

  it("returns null for a missing file", () => {
    expect(parseCommonsCredit({ query: { pages: { "-1": { missing: "" } } } })).toBeNull();
    expect(commonsFilePage("A,_B_(1).jpg")).toBe("https://commons.wikimedia.org/wiki/File:A,_B_(1).jpg");
  });
});

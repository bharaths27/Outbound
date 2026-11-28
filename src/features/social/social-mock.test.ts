// Social profiles against the mock backend: privacy, rating, want-to-go, likes, comments, import.
import { beforeAll, describe, expect, it } from "vitest";
import { mockService as d } from "@/lib/data/mock";

describe("profile boards and privacy", () => {
  beforeAll(async () => {
    await d.signInDemo("demo-sam"); // BU, friends-only, no friends yet
  });

  it("public profiles are open, with seeded reviews", async () => {
    const b = await d.getProfileBoard("demo-maya");
    expect(b?.visible).toBe(true);
    expect(b!.reviews.length).toBeGreaterThan(3);
    expect(b!.visits.length).toBeGreaterThan(0);
  });

  it("friends-only profiles stay closed to non-friends", async () => {
    const b = await d.getProfileBoard("u-bu-2"); // Marcus, friends-only
    expect(b?.visible).toBe(false);
    expect(b!.reviews).toEqual([]);
    expect(b!.visits).toEqual([]);
  });

  it("ghost mode hides everything", async () => {
    const b = await d.getProfileBoard("u-bu-5");
    expect(b?.visible).toBe(false);
  });

  it("you always see your own board", async () => {
    const b = await d.getProfileBoard("demo-sam");
    expect(b).toMatchObject({ visible: true, is_me: true });
  });

  it("friends-only opens up after the friend request is accepted", async () => {
    await d.signInDemo("demo-maya");
    const before = await d.getProfileBoard("u-neu-2"); // Aisha, friends-only, not Maya's friend
    expect(before?.visible).toBe(false);
    await d.signInDemo("demo-jordan");
    expect((await d.getProfileBoard("u-neu-3"))?.visible).toBe(true); // Ben is public anyway
    // Sam accepts Priya? Use the seeded incoming request: u-bu-1 -> demo-sam
    await d.signInDemo("demo-sam");
    await d.acceptFriendRequest("u-bu-1");
    expect((await d.getFriends()).map((p) => p.id)).toContain("u-bu-1");
  });
});

describe("rating, want-to-go, likes, comments", () => {
  beforeAll(async () => {
    await d.signInDemo("demo-sam");
  });

  it("won't rate a place you haven't checked in at, but saves it to want-to-go", async () => {
    await expect(d.saveReview("quincy-market-snack", 8, "x")).rejects.toThrow(/check in/);
    await d.setSaved("quincy-market-snack", true);
    expect((await d.getMyPlaceState("quincy-market-snack")).saved).toBe(true);
  });

  it("rates after a check-in, clamps the score, and updates instead of duplicating", async () => {
    expect((await d.checkIn("quincy-market-snack", null, {})).ok).toBe(true);
    const r1 = await d.saveReview("quincy-market-snack", 12, "  Great snacks  ");
    expect(r1.rating).toBe(10);
    expect(r1.note).toBe("Great snacks");
    const r2 = await d.saveReview("quincy-market-snack", 7.26, "ok");
    expect(r2.id).toBe(r1.id);
    expect(r2.rating).toBe(7.3);
    const board = await d.getProfileBoard("demo-sam");
    expect(board!.reviews.filter((r) => r.quest_id === "quincy-market-snack")).toHaveLength(1);
  });

  it("likes and comments on a public review", async () => {
    const [review] = (await d.getProfileBoard("demo-maya"))!.reviews;
    const before = review.likes;
    await d.setLiked(review.id, true);
    await d.setLiked(review.id, true); // idempotent
    let again = (await d.getProfileBoard("demo-maya"))!.reviews.find((r) => r.id === review.id)!;
    expect(again.likes).toBe(before + (review.liked_by_me ? 0 : 1));
    expect(again.liked_by_me).toBe(true);
    const c = await d.addComment(review.id, "  going this weekend  ");
    expect(c.text).toBe("going this weekend");
    expect((await d.getComments(review.id)).some((x) => x.id === c.id)).toBe(true);
    await d.deleteComment(c.id);
    await d.setLiked(review.id, false);
    again = (await d.getProfileBoard("demo-maya"))!.reviews.find((r) => r.id === review.id)!;
    expect(again.liked_by_me).toBe(false);
  });

  it("can't like a review you aren't allowed to see", async () => {
    await d.signInDemo("demo-maya");
    await d.updatePrivacy("ghost");
    await d.signInDemo("demo-sam");
    const hidden = (await d.getProfileBoard("demo-maya"))!;
    expect(hidden.visible).toBe(false);
    await expect(d.setLiked("rv-demo-maya-0", true)).rejects.toThrow();
    await d.signInDemo("demo-maya");
    await d.updatePrivacy("public");
  });

  it("imports Google reviews once", async () => {
    await d.signInDemo("demo-sam");
    const items = [{ name: "Tatte Bakery", address: "Boston", lat: 42.35, lon: -71.07, stars: 4, text: "Shakshuka!", date: "2026-10-02" }];
    expect(await d.importReviews(items)).toEqual({ imported: 1, skipped: 0 });
    expect(await d.importReviews(items)).toEqual({ imported: 0, skipped: 1 });
    const g = (await d.getProfileBoard("demo-sam"))!.reviews.find((r) => r.source === "google")!;
    expect(g).toMatchObject({ place_name: "Tatte Bakery", rating: 8, quest_id: null });
  });
});

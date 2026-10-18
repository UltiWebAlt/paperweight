import { countReleaseAssets, detectPlatform, fetchReleases, formatDate, main } from "./release-stats";

const release = { tag_name: "v1.2.3", published_at: "2025-02-03T12:00:00Z", assets: [
  { name: "Paperweight-Setup.exe", download_count: 4 },
  { name: "Paperweight.dmg", download_count: 3 },
  { name: "Paperweight.AppImage", download_count: 2 },
  { name: "paperweight.deb", download_count: 1 },
  { name: "source.zip", download_count: 9 },
] };

it("classifies release assets and aggregates platform downloads", () => {
  expect(detectPlatform("installer.exe")).toBe("win");
  expect(detectPlatform("macos-universal.app.tar.gz")).toBe("macos");
  expect(detectPlatform("app.AppImage")).toBe("linux-appimage");
  expect(detectPlatform("package.deb")).toBe("linux-deb");
  expect(detectPlatform("source.zip")).toBe("other");
  expect(countReleaseAssets(release)).toEqual({ win: 4, macos: 3, "linux-appimage": 2, "linux-deb": 1, other: 9 });
  expect(formatDate(release.published_at)).toBe("2025-02-03");
});

it("adds an optional GitHub token and throws a useful API error", async () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "gh-test";
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [release] } as Response);
  await expect(fetchReleases()).resolves.toEqual([release]);
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer gh-test" });
  fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Broken" } as Response);
  await expect(fetchReleases()).rejects.toThrow("GitHub API error: 500 Broken");
  if (previous === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = previous;
  fetchMock.mockRestore();
});

it("prints a summarized report for fetched releases", async () => {
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => [release] } as Response);
  const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  const previous = process.argv;
  process.argv = ["node", "release-stats.ts"];
  try {
    await main();
    expect(log).toHaveBeenCalledWith("Total - 19");
  } finally {
    process.argv = previous;
    fetchMock.mockRestore();
    log.mockRestore();
  }
});

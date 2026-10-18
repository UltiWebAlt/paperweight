/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import ImpactBlock from "./ImpactBlock";

describe("ImpactBlock", () => {
  const getImpactStats = jest.fn();
  beforeEach(() => {
    getImpactStats.mockReset();
    Object.defineProperty(window, "api", { configurable: true, value: { getImpactStats } });
  });

  it("stays hidden until stats load and hides a zero impact", async () => {
    getImpactStats.mockResolvedValue({ listsUnsubscribed: 0, emailsDeleted: 0, dataReclaimedBytes: 0 });
    const { container } = render(<ImpactBlock />);
    expect(container.firstChild).toBeNull();
    await waitFor(() => expect(getImpactStats).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders singular and plural impact text and refreshes when its key changes", async () => {
    getImpactStats
      .mockResolvedValueOnce({ listsUnsubscribed: 1, emailsDeleted: 2, dataReclaimedBytes: 1024 })
      .mockResolvedValueOnce({ listsUnsubscribed: 2, emailsDeleted: 1, dataReclaimedBytes: 0 });
    const { rerender } = render(<ImpactBlock refreshKey={0} />);
    expect(await screen.findByText("You've unsubscribed from 1 list and deleted 2 emails.")).toBeTruthy();
    expect(screen.getByText("1.0 KB reclaimed")).toBeTruthy();
    rerender(<ImpactBlock refreshKey={1} />);
    expect(await screen.findByText("You've unsubscribed from 2 lists and deleted 1 email.")).toBeTruthy();
    expect(screen.queryByText(/reclaimed/)).toBeNull();
    expect(getImpactStats).toHaveBeenCalledTimes(2);
  });
});

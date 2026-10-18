/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Mail from "./Mail";

const api = { queryVendors: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  api.queryVendors.mockResolvedValue({ vendors: [], total: 0 });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = (entry = "/mail") => render(<MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Mail /></MemoryRouter>);

it("loads mailing lists and composes search, preset, filter, and sort queries", async () => {
  setup();
  await screen.findByRole("heading", { name: "Mailing lists" });
  await waitFor(() => expect(api.queryVendors).toHaveBeenCalledWith(expect.objectContaining({ filter: "lists" })));
  fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "weekly" } });
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ search: "weekly" })));
  fireEvent.click(screen.getByRole("button", { name: "Priorities" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ activeSubscriptions: true })));
  fireEvent.click(screen.getAllByRole("button").find((button) => button.querySelector("svg.lucide-sliders-horizontal"))!);
  fireEvent.click(screen.getByRole("button", { name: /On breach list/ }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ onBreachList: true })));
});

it("restores a whitelisted preset and clears filters", async () => {
  setup("/mail");
  await screen.findByRole("heading", { name: "Mailing lists" });
  fireEvent.click(screen.getByRole("button", { name: "Whitelisted" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ showWhitelisted: true })));
  fireEvent.click(screen.getByRole("button", { name: "clear all" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ showWhitelisted: undefined })));
});

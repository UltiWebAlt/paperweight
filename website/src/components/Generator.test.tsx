/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { Generator } from "./Generator";

jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }), { virtual: true });

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ companies: [], breach: null }) }) as any;
});

it("switches request actions and enables review when the required identity is present", () => {
  render(<Generator />);
  expect(screen.getByRole("button", { name: "Access my data" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove my data" }));
  fireEvent.change(screen.getByPlaceholderText("Full name *"), { target: { value: "Taylor Example" } });
  fireEvent.change(screen.getByPlaceholderText("Email *"), { target: { value: "taylor@example.test" } });
  fireEvent.change(screen.getByPlaceholderText("Search company..."), { target: { value: "Example Co" } });
  fireEvent.change(screen.getByPlaceholderText("privacy@company.com"), { target: { value: "privacy@example.test" } });
  expect((screen.getByRole("button", { name: "Copy message" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/Your request/)).toBeTruthy();
});

it("provides an accessible explanation of how entered details are used", () => {
  render(<Generator />);
  expect(screen.getByRole("dialog", { name: "How your details are used" })).toBeTruthy();
});

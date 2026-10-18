/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { LayoutSelector } from "./LayoutSelector";

let mockPathname = "/home";
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }), { virtual: true });
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }), { virtual: true });
jest.mock("@/components/NavDropdown", () => ({ NavDropdown: ({ label }: any) => <button>{label}</button> }));
jest.mock("@/components/Newsletter", () => ({ Newsletter: () => <div>Newsletter</div> }));

const props = { featureNavLinks: [], guideNavLinks: [], resourceNavLinks: [], children: <p>Page body</p> };

it("renders the regular site navigation and controls the accessible mobile menu", () => {
  mockPathname = "/home";
  render(<LayoutSelector {...props} />);
  expect(screen.getByRole("link", { name: /Paperweight/ })).toBeTruthy();
  expect(screen.getByText("Page body")).toBeTruthy();
  const header = document.querySelector("header")!;
  fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
  expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
  expect(header.hasAttribute("inert")).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  expect(header.hasAttribute("inert")).toBe(false);
});

it("renders standalone routes without the main site chrome", () => {
  mockPathname = "/irl/live-capture";
  render(<LayoutSelector {...props} />);
  expect(screen.getByText("Page body")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open menu" })).toBeNull();
});

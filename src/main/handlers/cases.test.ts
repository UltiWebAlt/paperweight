const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock("electron", () => ({ ipcMain: { handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => mockHandlers.set(channel, fn)) } }));
jest.mock("../services/cases", () => Object.fromEntries(["closeGdprCase", "createGdprCase", "escalateGdprCase", "getGdprCaseById", "getGdprCaseReplies", "getUnseenCaseReplyCount", "insertGdprCaseEvent", "linkGdprCaseMessage", "markGdprCaseViewed", "queryGdprCases", "reopenGdprCase", "unlinkGdprCaseMessage"].map((key) => [key, jest.fn((...args: unknown[]) => ({ key, args }))])));
import { IPC } from "@shared/ipc";
import * as cases from "../services/cases";
import { registerCaseHandlers } from "./cases";

beforeAll(() => registerCaseHandlers());
const call = (channel: string, ...args: unknown[]) => mockHandlers.get(channel)!({}, ...args);

it("delegates case reads, mutations, replies, messages and activity operations", () => {
  const input = { vendorId: 2, requestType: "access" };
  expect(call(IPC.createGdprCase, input)).toEqual({ key: "createGdprCase", args: [input] });
  call(IPC.getGdprCase, 3);
  call(IPC.queryGdprCases, { status: "open" });
  call(IPC.closeGdprCase, 3);
  call(IPC.reopenGdprCase, 3);
  call(IPC.escalateGdprCase, 3);
  call(IPC.addGdprCaseEvent, 3, "email_sent", { details: "sent" });
  call(IPC.getGdprCaseReplies, 3);
  call(IPC.linkGdprCaseMessage, 3, "message");
  call(IPC.unlinkGdprCaseMessage, 3, "message");
  call(IPC.markGdprCaseViewed, 3);
  call(IPC.getUnseenCaseReplyCount);
  expect(cases.closeGdprCase).toHaveBeenCalledWith(3);
  expect(cases.insertGdprCaseEvent).toHaveBeenCalledWith(3, "email_sent", { details: "sent" });
  expect(cases.unlinkGdprCaseMessage).toHaveBeenCalledWith(3, "message");
  expect(cases.getUnseenCaseReplyCount).toHaveBeenCalledTimes(1);
});

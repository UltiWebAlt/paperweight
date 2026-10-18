import SMTPConnection from "nodemailer/lib/smtp-connection";
import { testSmtpConnection } from "./smtp";

jest.mock("nodemailer/lib/smtp-connection", () => jest.fn());
jest.mock("../utils/log", () => ({ syncLog: { info: jest.fn(), error: jest.fn() } }));
const config = { host: "smtp.example.com", port: 465, tls: true, username: "test@example.com", password: "test-only" };
let connection: { allowsAuth: boolean; once: jest.Mock; connect: jest.Mock; removeListener: jest.Mock; login: jest.Mock; quit: jest.Mock };

beforeEach(() => {
  connection = {
    allowsAuth: true, once: jest.fn(), removeListener: jest.fn(),
    connect: jest.fn((done) => done()), login: jest.fn((_auth, done) => done(null)), quit: jest.fn(),
  };
  jest.mocked(SMTPConnection).mockImplementation(() => connection as unknown as SMTPConnection);
});

it("connects with certificate validation and authenticates before reporting success", async () => {
  await expect(testSmtpConnection(config)).resolves.toEqual({ success: true });
  expect(SMTPConnection).toHaveBeenLastCalledWith(expect.objectContaining({ secure: true, tls: undefined, connectionTimeout: 10_000 }));
  expect(connection.login).toHaveBeenCalledWith({ user: config.username, pass: config.password }, expect.any(Function));
  expect(connection.quit).toHaveBeenCalledTimes(1);
});

it("allows self-signed certificates only after an explicit opt-in", async () => {
  await testSmtpConnection({ ...config, allowSelfSigned: true });
  expect(SMTPConnection).toHaveBeenLastCalledWith(expect.objectContaining({ tls: { rejectUnauthorized: false } }));
});

it("rejects servers that do not offer authentication", async () => {
  connection.allowsAuth = false;
  const result = await testSmtpConnection(config);
  expect(result.success).toBe(false);
  expect(result.error).toContain("did not offer authentication");
  expect(connection.login).not.toHaveBeenCalled();
  expect(connection.quit).toHaveBeenCalledTimes(1);
});

it("closes failed connections and returns a friendly error", async () => {
  connection.connect.mockImplementation(() => connection.once.mock.calls[0][1](new Error("ECONNREFUSED 127.0.0.1:465")));
  connection.quit.mockImplementation(() => { throw new Error("Already disconnected"); });
  const result = await testSmtpConnection(config);
  expect(result.error).toContain("Connection refused");
  expect(connection.login).not.toHaveBeenCalled();
});

it("reports login rejection and attempts to quit", async () => {
  connection.login.mockImplementation((_auth, done) => done(new Error("Invalid credentials")));
  const result = await testSmtpConnection(config);
  expect(result).toEqual({ success: false, error: "Authentication failed. Check your username and password." });
  expect(connection.quit).toHaveBeenCalledTimes(1);
});

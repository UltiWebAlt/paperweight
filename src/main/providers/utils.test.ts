import { buildRfc822Message, friendlyConnectionError } from "./utils";

test.each([
  [new Error("self signed certificate"), 'Invalid server certificate. Try toggling "Self-signed cert".'],
  ["WRONG_VERSION_NUMBER", 'TLS handshake failed. Try toggling "Implicit TLS".'],
  ["ECONNREFUSED 127.0.0.1:993", "Connection refused at 127.0.0.1:993. Check the mail server."],
  ["ECONNREFUSED", "Connection refused at the specified host/port. Check the mail server."],
  ["ENOTFOUND", "Could not reach the mail server. Check the host and port."],
  ["Invalid credentials", "Authentication failed. Check your username and password."],
  ["Failed to refresh access token: invalid_grant", "Authorization expired. Reconnect your account to continue syncing."],
  ["token expired", "Authorization expired. Reconnect your account to continue syncing."],
  ["Unknown failure", "Unknown failure"],
])("explains connection error %s", (error, expected) => expect(friendlyConnectionError(error)).toBe(expected));

it("builds plain-text mail with threading headers and UTF-8 encoding", () => {
  const plain = buildRfc822Message("me@example.com", "leave@example.com", "Unsubscribe", "Line 1\nLine 2");
  expect(plain).toContain("Content-Transfer-Encoding: 7bit");
  expect(plain).toContain("Subject: Unsubscribe");
  const unicode = buildRfc822Message("me@example.com", "leave@example.com", "Désinscrire", "Merci à vous", "<previous@example.com>");
  expect(unicode).toContain(`Subject: =?UTF-8?B?${Buffer.from("Désinscrire").toString("base64")}?=`);
  expect(unicode).toContain("Content-Transfer-Encoding: 8bit");
  expect(unicode).toContain("In-Reply-To: <previous@example.com>");
  expect(unicode).toContain("References: <previous@example.com>");
});

test.each([0, 1, 2, 4])("rejects CRLF injection in header argument %i", (index) => {
  const args: [string, string, string, string, string?] = ["me@example.com", "leave@example.com", "Unsubscribe", "Body", "<previous@example.com>"];
  args[index] = "value\r\nBcc: attacker@example.com";
  expect(() => buildRfc822Message(...args)).toThrow("must not contain line breaks");
});

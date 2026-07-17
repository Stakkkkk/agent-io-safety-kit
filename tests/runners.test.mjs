import test from "node:test";
import { testRunner, testShellHelpers } from "./run-tests.mjs";
import { withTemp } from "./test-utils.mjs";

test("structured command runner", () => withTemp(testRunner));
test("Node UTF-8 and remote Bash helpers", () => withTemp(testShellHelpers));

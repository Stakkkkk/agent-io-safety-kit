import test from "node:test";
import { testPathLister, testTextTools } from "./run-tests.mjs";
import { withTemp } from "./test-utils.mjs";

test("text inspection, reading, transcoding, and byte replacement", () => withTemp(testTextTools));
test("path listing", () => withTemp(testPathLister));

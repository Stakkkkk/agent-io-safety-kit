import test from "node:test";
import {
  testBundleTextPolicy,
  testCliHelp,
  testCursorHookExample,
  testMetadata,
  testReleaseNotes,
  testSnippetCompactness,
} from "./run-tests.mjs";

test("repository text policy", testBundleTextPolicy);
test("CLI help", testCliHelp);
test("package and schema metadata", testMetadata);
test("release notes", testReleaseNotes);
test("shared shell policy through Cursor hook", testCursorHookExample);
test("managed snippet remains compact", testSnippetCompactness);

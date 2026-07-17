import test from "node:test";
import { testDeployment } from "./run-tests.mjs";
import { withTemp } from "./test-utils.mjs";

test("deployment, doctor, profiles, drift, and uninstall", () => withTemp(testDeployment));

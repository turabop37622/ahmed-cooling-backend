// The routes print progress lines with console.log. Under `node --test` a burst of output can split the test
// runner's own messages and produce a bogus "Unable to deserialize cloned data" failure, so keep the run quiet.
if (!process.env.DEBUG_TESTS) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
}

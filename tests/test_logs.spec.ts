import { ReadTestLog } from "./read_db";
import { MockMe } from "./mock";

describe("Test logs", () => {
    let mm = new MockMe();

    beforeEach(() => {
        mm.beforeEach();
    });

    beforeAll(() => {
        mm.beforeAll();
    });

    afterAll(() => {
        mm.afterAll();
    });

    for (const log of ['test1.log', 'test2.log']) {
        test(`Executing ${log}`, async () => {
            console.log(`Running log ${log}`)
            const rtl = new ReadTestLog(`${log}`);
            await rtl.execute();
        });
    }
});
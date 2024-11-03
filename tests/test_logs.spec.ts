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

    for (const log of [
        'test.01',
        'test.02',
        'test.03',
        'test.04',
        'test.05',
    ]) {
        test(`Executing ${log}`, async () => {
            console.log(`Running log ${log}`)
            const rtl = new ReadTestLog(`${log}`);
            await rtl.execute();
        });
    }
});
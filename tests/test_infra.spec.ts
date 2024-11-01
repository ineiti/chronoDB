import { Checkbox, Tag } from "../src/blobs";
import { ReadTestDB } from "./read_db";
import { MockMe } from "./mock";

describe("Test infra", () => {
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

    test('Loading DBs', async () => {
        const db1 = new ReadTestDB('tests/files/db/empty');
        await db1.load();
        expect(db1.lines.toString()).toBe('');

        const tag = Tag.create(db1.db, "TODO");
        const checkbox = Checkbox.create(db1.db, "First Element");
        checkbox.createLinkDirected(tag);
        await db1.db.sync();

        const db2 = new ReadTestDB('tests/files/db/add.01');
        await db2.load();
        expect(db1.equals(db2)).toBeTruthy();
    });
});
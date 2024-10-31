import { randomBlobID } from "../src/storage";
import { Checkbox, Tag } from "../src/blobs";
import { ReadTestDB } from "./read_db";
const crypto = require('crypto');

describe("Use first log", () => {
    let date: number = 0;
    let rnd: number = 0;

    beforeEach(() => {
        date = 1633036800000;
        rnd = 0;
    });

    beforeAll(() => {
        jest.spyOn(global.Date, 'now').mockImplementation(() => date++);
        jest.spyOn(crypto, 'randomBytes').mockImplementation((size: number) => {
            const out = Buffer.from(Array(size).fill(0));
            out.writeInt32LE(rnd++);
            return out;
        });
    });

    afterAll(() => {
        jest.spyOn(global.Date, 'now').mockRestore();
        jest.spyOn(crypto, 'randomBytes').mockRestore();
    });

    test('Mocking', () => {
        console.log(rnd, randomBlobID());
        console.log(rnd, randomBlobID());
        console.log(rnd, randomBlobID());
    });

    test('Loading DBs', async () => {
        const db1 = new ReadTestDB('tests/files/db/empty');
        await db1.load();
        expect(db1.lines.toString()).toBe('');

        const tag = Tag.create(db1.db, "TODO");
        const checkbox = Checkbox.create(db1.db, "First Element");
        checkbox.createLinkDirected(tag);
        await db1.db.sync();
        console.log(db1.lines);
    })
})
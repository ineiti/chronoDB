const jestConsole = console;

export class MockMe {
    date: number = 0;
    rnd: number = 0;

    beforeEach() {
        this.date = 0;
        this.rnd = 0;
    }

    beforeAll() {
        global.console = require('console');
        jest.spyOn(global.Date, 'now').mockImplementation(() => this.date++);
        jest.spyOn(require('crypto'), 'randomBytes').mockImplementation((size: number) => {
            const out = Buffer.from(Array(size).fill(0));
            out.writeInt32LE(this.rnd++);
            return out;
        });
    }

    afterAll() {
        global.console = jestConsole;
        jest.spyOn(global.Date, 'now').mockRestore();
        jest.spyOn(require('crypto'), 'randomBytes').mockRestore();
    }
}

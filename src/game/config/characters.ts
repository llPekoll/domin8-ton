export interface CharacterConfig {
    key: string;
    spriteSheet: string;
    jsonPath: string;
    prefix: string;
    suffix: string;
    animations: {
        idle: { start: number; end: number };
        walk: { start: number; end: number };
    };
}

export const CHARACTERS: CharacterConfig[] = [
    {
        key: 'orc',
        spriteSheet: 'spriteSheets/orc.png',
        jsonPath: 'spriteSheets/orc.json',
        prefix: 'Orc ',
        suffix: '.aseprite',
        animations: {
            idle: { start: 0, end: 5 },
            walk: { start: 6, end: 13 }
        }
    },
    {
        key: 'soldier',
        spriteSheet: 'spriteSheets/Soldier.png',
        jsonPath: 'spriteSheets/Soldier.json',
        prefix: 'Soldier ',
        suffix: '.aseprite',
        animations: {
            idle: { start: 0, end: 5 },
            walk: { start: 6, end: 13 }
        }
    }
    // Easy to add more characters here
    // {
    //     key: 'wizard',
    //     spriteSheet: 'spriteSheets/wizard.png',
    //     jsonPath: 'spriteSheets/wizard.json',
    //     prefix: 'Wizard ',
    //     suffix: '.aseprite',
    //     animations: {
    //         idle: { start: 0, end: 5 },
    //         walk: { start: 6, end: 13 }
    //     }
    // },
];

// Helper to get random character
export function getRandomCharacter(): CharacterConfig {
    return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
}
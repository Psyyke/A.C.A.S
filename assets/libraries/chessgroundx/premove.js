import * as util from './util.js';
const diff = (a, b) => Math.abs(a - b);
const pawn = (color) => (x1, y1, x2, y2) => diff(x1, x2) < 2 &&
    (color === 'white'
        ? // allow 2 squares from first two ranks, for horde
            y2 === y1 + 1 || (y1 <= 1 && y2 === y1 + 2 && x1 === x2)
        : y2 === y1 - 1 || (y1 >= 6 && y2 === y1 - 2 && x1 === x2));
export const knight = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === 1 && yd === 2) || (xd === 2 && yd === 1);
};
const bishop = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2);
};
const rook = (x1, y1, x2, y2) => {
    return x1 === x2 || y1 === y2;
};
export const queen = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2);
};
const king = (color, rookFiles, canCastle) => (x1, y1, x2, y2) => (diff(x1, x2) < 2 && diff(y1, y2) < 2) ||
    (canCastle &&
        y1 === y2 &&
        y1 === (color === 'white' ? 0 : 7) &&
        ((x1 === 4 && ((x2 === 2 && rookFiles.includes(0)) || (x2 === 6 && rookFiles.includes(7)))) ||
            rookFiles.includes(x2)));
function rookFilesOf(pieces, color) {
    const backrank = color === 'white' ? '1' : '8';
    const files = [];
    for (const [key, piece] of pieces) {
        if (key[1] === backrank && piece.color === color && piece.role === 'r-piece') {
            files.push(util.key2pos(key)[0]);
        }
    }
    return files;
}
function and(...ms) {
    return (x1, y1, x2, y2) => ms.map(m => m(x1, y1, x2, y2)).reduce((a, b) => a && b);
}
function or(...ms) {
    return (x1, y1, x2, y2) => ms.map(m => m(x1, y1, x2, y2)).reduce((a, b) => a || b);
}
/* TODO make use of this
function not(m: Mobility): Mobility {
  return (x1, y1, x2, y2) => !m(x1, y1, x2, y2);
}
*/
function _distance(dist) {
    return (x1, y1, x2, y2) => Math.max(diff(x1, x2), diff(y1, y2)) <= dist;
}
function memoizeDistance() {
    const cache = {};
    return (dist) => {
        const key = `${dist}`;
        if (!(key in cache))
            cache[key] = _distance(dist);
        return cache[key];
    };
}
const distance = memoizeDistance();
function backrank(color) {
    return color === 'white' ? 0 : 7;
}
// king without castling
const kingNoCastling = (x1, y1, x2, y2) => {
    return diff(x1, x2) < 2 && diff(y1, y2) < 2;
};
// 960 king (can only castle with king takes rook)
function king960(color, rookFiles, canCastle) {
    return (x1, y1, x2, y2) => kingNoCastling(x1, y1, x2, y2) || (canCastle && y1 === y2 && y1 === backrank(color) && rookFiles.includes(x2));
}
// capablanca king (different castling files from standard chess king)
function kingCapa(color, rookFiles, canCastle) {
    return (x1, y1, x2, y2) => kingNoCastling(x1, y1, x2, y2) ||
        (canCastle &&
            y1 === y2 &&
            y1 === backrank(color) &&
            x1 === 5 &&
            ((x2 === 8 && rookFiles.includes(9)) || (x2 === 2 && rookFiles.includes(0))));
}
// shako king (different castling files and ranks from standard chess king)
function kingShako(color, rookFiles, canCastle) {
    return (x1, y1, x2, y2) => kingNoCastling(x1, y1, x2, y2) ||
        (canCastle &&
            y1 === y2 &&
            y1 === (color === 'white' ? 1 : 8) &&
            x1 === 5 &&
            ((x2 === 7 && rookFiles.includes(8)) || (x2 === 3 && rookFiles.includes(1))));
}
function rookFilesOfShako(pieces, color) {
    const backrank = color === 'white' ? '2' : '9';
    const files = [];
    for (const [key, piece] of pieces) {
        if (key[1] === backrank && piece.color === color && piece.role === 'r-piece') {
            files.push(util.key2pos(key)[0]);
        }
    }
    return files;
}
// ouk king (can jump like a knight to the second row on its first move)
function kingOuk(color, canCastle) {
    return (x1, y1, x2, y2) => kingNoCastling(x1, y1, x2, y2) ||
        (canCastle &&
            (color === 'white'
                ? x1 === 3 && y1 === 0 && (x2 === 1 || x2 === 5) && y2 === 1
                : x1 === 4 && y1 === 7 && (x2 === 6 || x2 === 2) && y2 === 6));
}
function pawnNoDoubleStep(color) {
    return (x1, y1, x2, y2) => diff(x1, x2) < 2 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1);
}
// grand pawn (10x10 board, can move two squares on third row)
function pawnGrand(color) {
    return (x1, y1, x2, y2) => diff(x1, x2) < 2 &&
        (color === 'white'
            ? y2 === y1 + 1 || (y1 <= 2 && y2 === y1 + 2 && x1 === x2)
            : y2 === y1 - 1 || (y1 >= 7 && y2 === y1 - 2 && x1 === x2));
}
// sittuyin pawn (8x8 board, can move diagonally backward to promote on some squares)
function pawnSittuyin(pieces, color) {
    return (x1, y1, x2, y2) => {
        let canPromote = (color === 'white' ? y1 >= 4 : y1 <= 3) && (x1 === y1 || 7 - x1 === y1);
        if (!canPromote) {
            let pawnCount = 0;
            for (const p of pieces.values())
                if (p.role === 'p-piece' && p.color === color)
                    pawnCount += 1;
            canPromote || (canPromote = pawnCount === 1);
        }
        return pawnNoDoubleStep(color)(x1, y1, x2, y2) || (canPromote && ferz(x1, y1, x2, y2));
    };
}
function pawnBerolina(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        return (color === 'white'
            ? // allow 2 squares from first two ranks, for horde
                (y2 === y1 + 1 && xd <= 1) || (y1 <= 1 && y2 === y1 + 2 && xd === 2)
            : (y2 === y1 - 1 && xd <= 1) || (y1 >= 6 && y2 === y1 - 2 && xd === 2));
    };
}
const sideways = (x1, y1, x2, y2) => {
    return y1 === y2 && diff(x1, x2) <= 1;
};
// wazir
const wazir = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === 1 && yd === 0) || (xd === 0 && yd === 1);
};
// ferz, met
const ferz = (x1, y1, x2, y2) => diff(x1, x2) === diff(y1, y2) && diff(x1, x2) === 1;
// ouk ferz (can jump two squares forward on its first move)
function ferzOuk(color) {
    return (x1, y1, x2, y2) => ferz(x1, y1, x2, y2) ||
        (color === 'white' ? x1 === 4 && y1 === 0 && x2 === 4 && y2 === 2 : x1 === 3 && y1 === 7 && x2 === 3 && y2 === 5);
}
// shatranj elephant
const elephant = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return xd === yd && xd === 2;
};
// archbishop (knight + bishop)
const archbishop = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
// chancellor (knight + rook)
const chancellor = (x1, y1, x2, y2) => {
    return rook(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
// amazon (knight + queen)
const amazon = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
// shogun general (knight + king)
const centaur = (x1, y1, x2, y2) => {
    return kingNoCastling(x1, y1, x2, y2) || knight(x1, y1, x2, y2);
};
// shogi lance
function shogiLance(color) {
    return (x1, y1, x2, y2) => x2 === x1 && (color === 'white' ? y2 > y1 : y2 < y1);
}
// shogi silver, makruk khon, sittuyin elephant
function shogiSilver(color) {
    return (x1, y1, x2, y2) => ferz(x1, y1, x2, y2) || (x1 === x2 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1));
}
// shogi gold, promoted pawn/knight/lance/silver
function shogiGold(color) {
    return (x1, y1, x2, y2) => wazir(x1, y1, x2, y2) || (diff(x1, x2) < 2 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1));
}
// shogi pawn
function shogiPawn(color) {
    return (x1, y1, x2, y2) => x2 === x1 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1);
}
// shogi knight
function shogiKnight(color) {
    return (x1, y1, x2, y2) => (x2 === x1 - 1 || x2 === x1 + 1) && (color === 'white' ? y2 === y1 + 2 : y2 === y1 - 2);
}
// shogi promoted rook (dragon king)
const shogiDragon = (x1, y1, x2, y2) => {
    return rook(x1, y1, x2, y2) || ferz(x1, y1, x2, y2);
};
// shogi promoted bishop (dragon horse)
const shogiHorse = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || wazir(x1, y1, x2, y2);
};
function _palace(bd, color) {
    const middleFile = Math.floor(bd.width / 2);
    const startingRank = color === 'white' ? 0 : bd.height - 3;
    return [
        [middleFile - 1, startingRank + 2],
        [middleFile, startingRank + 2],
        [middleFile + 1, startingRank + 2],
        [middleFile - 1, startingRank + 1],
        [middleFile, startingRank + 1],
        [middleFile + 1, startingRank + 1],
        [middleFile - 1, startingRank],
        [middleFile, startingRank],
        [middleFile + 1, startingRank],
    ];
}
function memoizePalace() {
    const cache = {};
    return (bd, color) => {
        const key = `${bd.width}x${bd.height}${color.slice(0, 1)}`;
        if (!(key in cache))
            cache[key] = _palace(bd, color);
        return cache[key];
    };
}
const palace = memoizePalace();
// xiangqi pawn
function xiangqiPawn(color) {
    return (x1, y1, x2, y2) => (x2 === x1 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1)) ||
        (y2 === y1 && diff(x1, x2) < 2 && (color === 'white' ? y1 > 4 : y1 < 5));
}
// minixiangqi pawn
function minixiangqiPawn(color) {
    return (x1, y1, x2, y2) => (x2 === x1 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1)) || (y2 === y1 && diff(x1, x2) < 2);
}
// xiangqi elephant
function xiangqiElephant(color) {
    return (x1, y1, x2, y2) => elephant(x1, y1, x2, y2) && (color === 'white' ? y2 < 5 : y2 > 4);
}
// xiangqi advisor
function xiangqiAdvisor(color, bd) {
    const p = palace(bd, color);
    return (x1, y1, x2, y2) => ferz(x1, y1, x2, y2) && p.some(point => point[0] === x2 && point[1] === y2);
}
// xiangqi general (king)
function xiangqiKing(color, bd) {
    const p = palace(bd, color);
    return (x1, y1, x2, y2) => wazir(x1, y1, x2, y2) && p.some(point => point[0] === x2 && point[1] === y2);
}
// shako elephant
const shakoElephant = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2) && diff(x1, x2) < 3;
};
// janggi elephant
export const janggiElephant = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === 2 && yd === 3) || (xd === 3 && yd === 2);
};
// janggi pawn
function janggiPawn(color, bd) {
    const oppPalace = palace(bd, util.opposite(color));
    return (x1, y1, x2, y2) => {
        const palacePos = oppPalace.findIndex(point => point[0] === x1 && point[1] === y1);
        let additionalMobility;
        switch (palacePos) {
            case 0:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 + 1 && color === 'black' && y2 === y1 - 1;
                break;
            case 2:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 - 1 && color === 'black' && y2 === y1 - 1;
                break;
            case 4:
                additionalMobility = (x1, y1, x2, y2) => diff(x1, x2) === 1 && (color === 'white' ? y2 === y1 + 1 : y2 === y1 - 1);
                break;
            case 6:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 + 1 && color === 'white' && y2 === y1 + 1;
                break;
            case 8:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 - 1 && color === 'white' && y2 === y1 + 1;
                break;
            default:
                additionalMobility = () => false;
        }
        return minixiangqiPawn(color)(x1, y1, x2, y2) || additionalMobility(x1, y1, x2, y2);
    };
}
// janggi rook
function janggiRook(bd) {
    const wPalace = palace(bd, 'white');
    const bPalace = palace(bd, 'black');
    return (x1, y1, x2, y2) => {
        let additionalMobility;
        const wPalacePos = wPalace.findIndex(point => point[0] === x1 && point[1] === y1);
        const bPalacePos = bPalace.findIndex(point => point[0] === x1 && point[1] === y1);
        const palacePos = wPalacePos !== -1 ? wPalacePos : bPalacePos;
        const xd = diff(x1, x2);
        const yd = diff(y1, y2);
        switch (palacePos) {
            case 0:
                additionalMobility = (x1, y1, x2, y2) => xd === yd && x2 > x1 && x2 <= x1 + 2 && y2 < y1 && y2 >= y1 - 2;
                break;
            case 2:
                additionalMobility = (x1, y1, x2, y2) => xd === yd && x2 < x1 && x2 >= x1 - 2 && y2 < y1 && y2 >= y1 - 2;
                break;
            case 4:
                additionalMobility = ferz;
                break;
            case 6:
                additionalMobility = (x1, y1, x2, y2) => xd === yd && x2 > x1 && x2 <= x1 + 2 && y2 > y1 && y2 <= y1 + 2;
                break;
            case 8:
                additionalMobility = (x1, y1, x2, y2) => xd === yd && x2 < x1 && x2 >= x1 - 2 && y2 > y1 && y2 <= y1 + 2;
                break;
            default:
                additionalMobility = () => false;
        }
        return rook(x1, y1, x2, y2) || additionalMobility(x1, y1, x2, y2);
    };
}
// janggi general (king)
function janggiKing(color, bd) {
    const ownPalace = palace(bd, color);
    return (x1, y1, x2, y2) => {
        const palacePos = ownPalace.findIndex(point => point[0] === x1 && point[1] === y1);
        let additionalMobility;
        switch (palacePos) {
            case 0:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 + 1 && y2 === y1 - 1;
                break;
            case 2:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 - 1 && y2 === y1 - 1;
                break;
            case 4:
                additionalMobility = ferz;
                break;
            case 6:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 + 1 && y2 === y1 + 1;
                break;
            case 8:
                additionalMobility = (x1, y1, x2, y2) => x2 === x1 - 1 && y2 === y1 + 1;
                break;
            default:
                additionalMobility = () => false;
        }
        return ((wazir(x1, y1, x2, y2) || additionalMobility(x1, y1, x2, y2)) &&
            ownPalace.some(point => point[0] === x2 && point[1] === y2));
    };
}
// musketeer leopard
const musketeerLeopard = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === 1 || xd === 2) && (yd === 1 || yd === 2);
};
// musketeer hawk
const musketeerHawk = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return ((xd === 0 && (yd === 2 || yd === 3)) ||
        (yd === 0 && (xd === 2 || xd === 3)) ||
        (xd === yd && (xd === 2 || xd === 3)));
};
// musketeer elephant
const musketeerElephant = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return xd === 1 || yd === 1 || (xd === 2 && (yd === 0 || yd === 2)) || (xd === 0 && yd === 2);
};
// musketeer cannon
const musketeerCannon = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return xd < 3 && (yd < 2 || (yd === 2 && xd === 0));
};
// musketeer unicorn
const musketeerUnicorn = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return knight(x1, y1, x2, y2) || (xd === 1 && yd === 3) || (xd === 3 && yd === 1);
};
// musketeer dragon
const musketeerDragon = (x1, y1, x2, y2) => {
    return knight(x1, y1, x2, y2) || queen(x1, y1, x2, y2);
};
// musketeer fortress
const musketeerFortress = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === yd && xd < 4) || (yd === 0 && xd === 2) || (yd === 2 && xd < 2);
};
// musketeer spider
const musketeerSpider = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return xd < 3 && yd < 3 && !(xd === 1 && yd === 0) && !(xd === 0 && yd === 1);
};
// tori shogi goose (promoted swallow)
function toriGoose(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        return color === 'white'
            ? (xd === 2 && y2 === y1 + 2) || (xd === 0 && y2 === y1 - 2)
            : (xd === 2 && y2 === y1 - 2) || (xd === 0 && y2 === y1 + 2);
    };
}
// tori shogi left quail
function toriLeftQuail(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        const yd = diff(y1, y2);
        return color === 'white'
            ? (x2 === x1 && y2 > y1) || (xd === yd && x2 > x1 && y2 < y1) || (x2 === x1 - 1 && y2 === y1 - 1)
            : (x2 === x1 && y2 < y1) || (xd === yd && x2 < x1 && y2 > y1) || (x2 === x1 + 1 && y2 === y1 + 1);
    };
}
// tori shogi right quail
function toriRightQuail(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        const yd = diff(y1, y2);
        return color === 'white'
            ? (x2 === x1 && y2 > y1) || (xd === yd && x2 < x1 && y2 < y1) || (x2 === x1 + 1 && y2 === y1 - 1)
            : (x2 === x1 && y2 < y1) || (xd === yd && x2 > x1 && y2 > y1) || (x2 === x1 - 1 && y2 === y1 + 1);
    };
}
// tori shogi pheasant
function toriPheasant(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        return color === 'white'
            ? (x2 === x1 && y2 === y1 + 2) || (xd === 1 && y2 === y1 - 1)
            : (x2 === x1 && y2 === y1 - 2) || (xd === 1 && y2 === y1 + 1);
    };
}
// tori shogi crane
const toriCrane = (x1, y1, x2, y2) => {
    return kingNoCastling(x1, y1, x2, y2) && y2 !== y1;
};
// tori shogi falcon
function toriFalcon(color) {
    return (x1, y1, x2, y2) => {
        return color === 'white'
            ? kingNoCastling(x1, y1, x2, y2) && !(x2 === x1 && y2 === y1 - 1)
            : kingNoCastling(x1, y1, x2, y2) && !(x2 === x1 && y2 === y1 + 1);
    };
}
// tori shogi eagle (promoted falcon)
function toriEagle(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        const yd = diff(y1, y2);
        return color === 'white'
            ? kingNoCastling(x1, y1, x2, y2) || (xd === yd && (y2 > y1 || (y2 < y1 && yd <= 2))) || (x2 === x1 && y2 < y1)
            : kingNoCastling(x1, y1, x2, y2) || (xd === yd && (y2 < y1 || (y2 > y1 && yd <= 2))) || (x2 === x1 && y2 > y1);
    };
}
// chak pawn
function pawnChak(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        return color === 'white' ? y2 >= y1 && y2 - y1 <= 1 && xd <= 1 : y1 >= y2 && y1 - y2 <= 1 && xd <= 1;
    };
}
// chak warrior
function chakWarrior(color) {
    return (x1, y1, x2, y2) => toriCrane(x1, y1, x2, y2) && (color === 'white' ? y2 >= 4 : y2 <= 4);
}
// chak divine king
function chakDivineKing(color) {
    return (x1, y1, x2, y2) => {
        const xd = diff(x1, x2);
        const yd = diff(y1, y2);
        return queen(x1, y1, x2, y2) && xd <= 2 && yd <= 2 && (color === 'white' ? y2 >= 4 : y2 <= 4);
    };
}
// chennis king
function kingChennis(color) {
    return (x1, y1, x2, y2) => kingNoCastling(x1, y1, x2, y2) && x2 >= 1 && x2 <= 5 && (color === 'white' ? y2 <= 3 : y2 >= 3);
}
// cannot premove
const noMove = () => false;
export function premove(variant, chess960, bd) {
    const mobility = builtinMobility(variant, chess960, bd);
    return (boardState, key, canCastle) => {
        const pos = util.key2pos(key);
        return util
            .allPos(bd)
            .filter(pos2 => (pos[0] !== pos2[0] || pos[1] !== pos2[1]) &&
            mobility(boardState, key, canCastle)(pos[0], pos[1], pos2[0], pos2[1]))
            .map(util.pos2key);
    };
}
function builtinMobility(variant, chess960, bd) {
    switch (variant) {
        case 'xiangqi':
        case 'manchu':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn (soldier)
                        return xiangqiPawn(color);
                    case 'c-piece': // cannon
                    case 'r-piece': // chariot
                        return rook;
                    case 'n-piece': // horse
                        return knight;
                    case 'b-piece': // elephant
                        return xiangqiElephant(color);
                    case 'a-piece': // advisor
                        return xiangqiAdvisor(color, bd);
                    case 'k-piece': // king
                        return xiangqiKing(color, bd);
                    case 'm-piece': // banner
                        return chancellor;
                    default:
                        return noMove;
                }
            };
        case 'janggi':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn (soldier)
                        return janggiPawn(color, bd);
                    case 'c-piece': // cannon
                    case 'r-piece': // chariot
                        return janggiRook(bd);
                    case 'n-piece': // horse
                        return knight;
                    case 'b-piece': // elephant
                        return janggiElephant;
                    case 'a-piece': // advisor
                    case 'k-piece': // king
                        return janggiKing(color, bd);
                    default:
                        return noMove;
                }
            };
        case 'minixiangqi':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn (soldier
                        return minixiangqiPawn(color);
                    case 'c-piece': // cannon
                    case 'r-piece': // chariot
                        return rook;
                    case 'n-piece': // horse
                        return knight;
                    case 'k-piece': // king
                        return xiangqiKing(color, bd);
                    default:
                        return noMove;
                }
            };
        case 'shogi':
        case 'minishogi':
        case 'gorogoro':
        case 'gorogoroplus':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return shogiPawn(color);
                    case 'l-piece': // lance
                        return shogiLance(color);
                    case 'n-piece': // knight
                        return shogiKnight(color);
                    case 'k-piece': // king
                        return kingNoCastling;
                    case 's-piece': // silver
                        return shogiSilver(color);
                    case 'g-piece': // gold
                    case 'pp-piece': // tokin
                    case 'pl-piece': // promoted lance
                    case 'pn-piece': // promoted knight
                    case 'ps-piece': // promoted silver
                        return shogiGold(color);
                    case 'b-piece': // bishop
                        return bishop;
                    case 'r-piece': // rook
                        return rook;
                    case 'pr-piece': // dragon (promoted rook)
                        return shogiDragon;
                    case 'pb-piece': // horse (promoted bishop), not to be confused with the knight
                        return shogiHorse;
                    default:
                        return noMove;
                }
            };
        case 'kyotoshogi':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'l-piece': // kyoto - lance-tokin
                        return shogiLance(color);
                    case 'pl-piece':
                        return shogiGold(color);
                    case 's-piece': // ginkaku - silver-bishop
                        return shogiSilver(color);
                    case 'ps-piece':
                        return bishop;
                    case 'n-piece': // kinkei gold-knight
                        return shogiKnight(color);
                    case 'pn-piece':
                        return shogiGold(color);
                    case 'p-piece': // hifu - rook-pawn
                        return shogiPawn(color);
                    case 'pp-piece':
                        return rook;
                    case 'k-piece': // king
                        return kingNoCastling;
                    default:
                        return noMove;
                }
            };
        case 'dobutsu':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'c-piece': // chick
                        return shogiPawn(color);
                    case 'e-piece': // elephant
                        return ferz;
                    case 'g-piece': // giraffe
                        return wazir;
                    case 'l-piece': // lion
                        return kingNoCastling;
                    case 'pc-piece': // hen (promoted chick)
                        return shogiGold(color);
                    default:
                        return noMove;
                }
            };
        case 'torishogi':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 's-piece': // swallow
                        return shogiPawn(color);
                    case 'ps-piece': // goose (promoted swallow)
                        return toriGoose(color);
                    case 'l-piece': // left quail
                        return toriLeftQuail(color);
                    case 'r-piece': // right quail
                        return toriRightQuail(color);
                    case 'p-piece': // pheasant (NOT pawn)
                        return toriPheasant(color);
                    case 'c-piece': // crane
                        return toriCrane;
                    case 'f-piece': // falcon
                        return toriFalcon(color);
                    case 'pf-piece': // eagle (promoted falcon)
                        return toriEagle(color);
                    case 'k-piece': // phoenix
                        return kingNoCastling;
                    default:
                        return noMove;
                }
            };
        case 'makruk':
        case 'makpong':
        case 'sittuyin':
        case 'cambodian':
        case 'asean':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return variant === 'sittuyin' ? pawnSittuyin(boardState.pieces, color) : pawnNoDoubleStep(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // ASEAN khon
                    case 's-piece': // khon
                        return shogiSilver(color);
                    case 'q-piece': // ASEAN met
                    case 'f-piece': // Sittuyin ferz
                    case 'm-piece': // met
                        return variant === 'cambodian' ? ferzOuk(color) : ferz;
                    case 'k-piece': // king
                        return variant === 'cambodian' ? kingOuk(color, canCastle) : kingNoCastling;
                    default:
                        return noMove;
                }
            };
        case 'grand':
        case 'grandhouse':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawnGrand(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'c-piece': // chancellor
                        return chancellor;
                    case 'a-piece': // archbishop
                        return archbishop;
                    case 'k-piece': // king
                        return kingNoCastling;
                    default:
                        return noMove;
                }
            };
        case 'shako':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawnGrand(color);
                    case 'c-piece': // cannon
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'e-piece': // elephant
                        return shakoElephant;
                    case 'k-piece': // king
                        return kingShako(color, rookFilesOfShako(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'shogun':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'pp-piece': // captain
                        return kingNoCastling;
                    case 'r-piece': // rook
                        return rook;
                    case 'pr-piece': // mortar
                        return chancellor;
                    case 'n-piece': // knight
                        return knight;
                    case 'pn-piece': // general
                        return centaur;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'pb-piece': // archbishop
                        return archbishop;
                    case 'f-piece': // duchess
                        return ferz;
                    case 'pf-piece': // queen
                        return queen;
                    case 'k-piece': // king
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'orda':
        case 'ordamirror':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'l-piece': // lancer
                        return chancellor;
                    case 'h-piece': // kheshig
                        return centaur;
                    case 'a-piece': // archer
                        return archbishop;
                    case 'y-piece': // yurt
                        return shogiSilver(color);
                    case 'f-piece': // falcon
                        return amazon;
                    case 'k-piece': // king
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'synochess':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'c-piece': // cannon
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 's-piece': // soldier
                        return minixiangqiPawn(color);
                    case 'e-piece': // elephant
                        return shakoElephant;
                    case 'a-piece': // advisor
                        return kingNoCastling;
                    case 'k-piece': // king
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle && color === 'white');
                    default:
                        return noMove;
                }
            };
        case 'musketeer':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'l-piece': // leopard
                        return musketeerLeopard;
                    case 'o-piece': // cannon
                        return musketeerCannon;
                    case 'u-piece': // unicorn
                        return musketeerUnicorn;
                    case 'd-piece': // dragon
                        return musketeerDragon;
                    case 'c-piece': // chancellor
                        return chancellor;
                    case 'a-piece': // archbishop
                        return archbishop;
                    case 'e-piece': // elephant
                        return musketeerElephant;
                    case 'h-piece': // hawk
                        return musketeerHawk; // hawk
                    case 'f-piece': // fortress
                        return musketeerFortress;
                    case 's-piece': // spider
                        return musketeerSpider;
                    case 'k-piece':
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'hoppelpoppel':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight (takes like bishop)
                    case 'b-piece': // bishop (takes like knight)
                        return archbishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'k-piece': // king
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'shinobi':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'pl-piece':
                    case 'r-piece': // rook
                        return rook;
                    case 'ph-piece':
                    case 'n-piece': // knight
                        return knight;
                    case 'pm-piece':
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'pp-piece':
                    case 'c-piece': // captain
                        return kingNoCastling;
                    case 'l-piece': // lance
                        return shogiLance(color);
                    case 'h-piece': // horse
                        return shogiKnight(color);
                    case 'm-piece': // monk
                        return ferz;
                    case 'd-piece': // dragon
                        return shogiDragon;
                    case 'j-piece': // ninja
                        return archbishop;
                    case 'k-piece': // king
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'empire':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 's-piece': // soldier
                        return minixiangqiPawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                    case 'd-piece': // duke
                    case 't-piece': // tower
                    case 'c-piece': // cardinal
                        return queen;
                    case 'e-piece': // eagle
                        return amazon;
                    case 'k-piece': // king
                        return king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'chak':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawnChak(color);
                    case 'pp-piece': // warrior
                        return chakWarrior(color);
                    case 'r-piece': // serpent
                        return rook;
                    case 'v-piece': // vulture
                        return knight;
                    case 's-piece': // shaman
                        return toriCrane;
                    case 'j-piece': // jaguar
                        return centaur;
                    case 'q-piece': // quetzal
                        return queen;
                    case 'k-piece': // king
                        return kingNoCastling;
                    case 'pk-piece': // divine king
                        return chakDivineKing(color);
                    case 'o-piece': // offering
                    default:
                        return noMove;
                }
            };
        case 'chennis':
            return (boardState, key) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawnNoDoubleStep(color);
                    case 'pp-piece': // rook
                        return rook;
                    case 's-piece': // soldier
                        return minixiangqiPawn(color);
                    case 'ps-piece': // bishop
                        return bishop;
                    case 'f-piece': // ferz
                        return ferz;
                    case 'pf-piece': // cannon
                        return rook;
                    case 'm-piece': // mann
                        return kingNoCastling;
                    case 'pm-piece': // knight
                        return knight;
                    case 'k-piece': // king
                        return kingChennis(color);
                    default:
                        return noMove;
                }
            };
        case 'spartan':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'h-piece': // hoplite
                        return pawnBerolina(color);
                    case 'g-piece': // genaral
                        return shogiDragon;
                    case 'w-piece': // warlord
                        return archbishop;
                    case 'c-piece': // captain
                        return and(rook, distance(2));
                    case 'l-piece': // lieutenant
                        return or(and(bishop, distance(2)), sideways);
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'k-piece': // king
                        return chess960
                            ? king960(color, rookFilesOf(boardState.pieces, color), canCastle)
                            : king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        case 'capablanca':
        case 'capahouse':
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'c-piece': // chancellor
                        return chancellor;
                    case 'a-piece': // archbishop
                        return archbishop;
                    case 'k-piece': // king
                        return chess960
                            ? king960(color, rookFilesOf(boardState.pieces, color), canCastle)
                            : kingCapa(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
        // Variants using standard pieces and additional fairy pieces like S-chess etc.
        default:
            return (boardState, key, canCastle) => {
                const piece = boardState.pieces.get(key);
                const role = piece.role;
                const color = piece.color;
                switch (role) {
                    case 'p-piece': // pawn
                        return pawn(color);
                    case 'r-piece': // rook
                        return rook;
                    case 'n-piece': // knight
                        return knight;
                    case 'b-piece': // bishop
                        return bishop;
                    case 'q-piece': // queen
                        return queen;
                    case 'e-piece': // S-chess elephant
                    case 'c-piece': // chancellor
                        return chancellor;
                    case 'h-piece': // S-chess hawk
                    case 'a-piece': // archbishop
                        return archbishop;
                    case 'k-piece': // king
                        return chess960
                            ? king960(color, rookFilesOf(boardState.pieces, color), canCastle)
                            : king(color, rookFilesOf(boardState.pieces, color), canCastle);
                    default:
                        return noMove;
                }
            };
    }
}
//# sourceMappingURL=premove.js.map
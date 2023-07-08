import { configure } from '../config.js';
import { defaults } from '../state.js';
import { premove } from '../premove.js';
import { expect } from 'chai';

describe('premove() test', () => {
  it('chess white king', () => {
    const state = defaults();
    configure(state, { dimensions: { width: 8, height: 8 }, variant: 'chess', fen: '8/8/8/8/8/8/8/R3K2R w QK' });

    console.log(state.variant, state.boardState);
    const expected = ['a1', 'c1', 'd1', 'd2', 'e2', 'f2', 'f1', 'g1', 'h1'];
    const premoves = premove(state.variant, state.chess960, state.dimensions)(state.boardState, 'e1', state.premovable.castle);
    expect(premoves).to.have.members(expected);
  });
});

describe('premove() test', () => {
  it('janggi white king', () => {
    const state = defaults();
    configure(state, { dimensions: { width: 9, height: 10 }, variant: 'janggi', fen: '9/9/9/9/9/9/9/9/4K4/9' });

    console.log(state.variant, state.boardState);
    const expected = ['d1', 'd2', 'd3', 'e1', 'e3', 'f1', 'f2', 'f3'];
    const premoves = premove(state.variant, state.chess960, state.dimensions)(state.boardState, 'e2', state.premovable.castle);
    expect(premoves).to.have.members(expected);
  });
});

describe('premove() test', () => {
  it('janggi black pawn', () => {
    const state = defaults();
    configure(state, { dimensions: { width: 9, height: 10 }, variant: 'janggi', fen: '9/9/9/9/9/9/9/9/4p4/9' });

    console.log(state.variant, state.boardState);
    const expected = ['d1', 'd2', 'e1', 'f1', 'f2'];
    const premoves = premove(state.variant, state.chess960, state.dimensions)(state.boardState, 'e2', state.premovable.castle);
    expect(premoves).to.have.members(expected);
  });
});

describe('premove() test', () => {
  it('janggi black rook', () => {
    const state = defaults();
    configure(state, { dimensions: { width: 9, height: 10 }, variant: 'janggi', fen: '9/9/9/9/9/9/9/5r3/9/9' });

    console.log(state.variant, state.boardState);
    const expected = [
      'a3',
      'b3',
      'c3',
      'd1',
      'd3',
      'e2',
      'e3',
      'f1',
      'f2',
      'f4',
      'f5',
      'f6',
      'f7',
      'f8',
      'f9',
      'f:',
      'g3',
      'h3',
      'i3',
    ];
    const premoves = premove(state.variant, state.chess960, state.dimensions)(state.boardState, 'f3', state.premovable.castle);
    expect(premoves).to.have.members(expected);
  });
});

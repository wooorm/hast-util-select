'use strict';

var zwitch = require('zwitch');
var has = require('has');

module.exports = zwitch('nestingOperator');

var handle = module.exports;
var handlers = handle.handlers;

handle.support = ['>', '+', '~'];

handle.unknown = unknownNesting;
handle.invalid = topScan; /* `undefined` is the top query selector. */
handlers.null = descendant; /* `null` is the descendant combinator. */
handlers['>'] = child;
handlers['+'] = adjacentSibling;
handlers['~'] = generalSibling;

/* istanbul ignore next - Shouldn’t be invoked, parser gives correct data. */
function unknownNesting(query) {
  throw new Error('Unexpected nesting `' + query.nestingOperator + '`');
}

function topScan(query, node, index, parent, state) {
  /* istanbul ignore if - Shouldn’t happen. */
  if (parent) {
    // We would like to avoid spinning an extra loop through the starting
    // node's siblings just to count its typeIndex.
    throw new Error('topScan is supposed to be called from the root node');
  }

  state.iterator.apply(null, arguments);

  if (!state.shallow) {
    descendant.apply(this, arguments);
  }
}

function descendant(query, node, index, parent, state) {
  var prev = state.iterator;

  state.iterator = iterator;

  return child(query, node, index, parent, state);

  function iterator(subq, node, index) {
    prev.apply(this, arguments);

    if (state.one && state.found) {
      return;
    }

    child(query, node, index, node, state);
  }
}

function child(query, node, index, parent, state) {
  if (!node.children || node.children.length === 0) {
    return;
  }

  walkIterator(query, node, state)
    .each()
    .done();
}

function adjacentSibling(query, node, index, parent, state) {
  /* istanbul ignore if - Shouldn’t happen. */
  if (!parent) {
    return;
  }

  walkIterator(query, parent, state)
    .prefillTypeIndex(0, ++index)
    .each(index, ++index)
    .prefillTypeIndex(index)
    .done();
}

function generalSibling(query, node, index, parent, state) {
  /* istanbul ignore if - Shouldn’t happen. */
  if (!parent) {
    return;
  }

  walkIterator(query, parent, state)
    .prefillTypeIndex(0, ++index)
    .each(index)
    .done();
}

/* Handles typeIndex and typeCount properties for every walker. */
function walkIterator(query, parent, state) {
  var nodes = parent.children;
  var typeIndex = state.index ? createTypeIndex() : null;
  var delayed = [];

  return {
    prefillTypeIndex: rangeDefaults(prefillTypeIndex),
    each: rangeDefaults(each),
    done: done
  };

  function done() {
    var length = delayed.length;
    var index = -1;

    while (++index < length) {
      delayed[index]();

      if (state.one && state.found) {
        break;
      }
    }

    return this;
  }

  function prefillTypeIndex(start, end) {
    if (typeIndex) {
      while (start < end) {
        typeIndex(nodes[start]);
        start++;
      }
    }

    return this;
  }

  function each(start, end) {
    var child = nodes[start];
    var index;
    var elementIndex;

    if (start >= end) {
      return this;
    }

    if (typeIndex) {
      elementIndex = typeIndex.elements;
      index = typeIndex(child);
      delayed.push(delay);
    } else {
      pushNode();
    }

    /* Stop if we’re looking for one node and it’s already found. */
    if (state.one && state.found) {
      return this;
    }

    return each.call(this, start + 1, end);

    function delay() {
      state.typeIndex = index;
      state.elementIndex = elementIndex;
      state.typeCount = typeIndex.count(child);
      state.elementCount = typeIndex.elements;
      pushNode();
    }

    function pushNode() {
      state.iterator(query, child, start, parent, state);
    }
  }

  function rangeDefaults(iterator) {
    return rangeDefault;

    function rangeDefault(start, end) {
      if (start === null || start === undefined || start < 0) {
        start = 0;
      }

      if (end === null || end === undefined || end > nodes.length) {
        end = nodes.length;
      }

      return iterator.call(this, start, end);
    }
  }
}

function createTypeIndex() {
  var counts = {};

  index.count = count;
  index.elements = 0;

  return index;

  function index(node) {
    var type = node.tagName;

    if (!type) {
      return 0;
    }

    index.elements++;

    if (!has(counts, type)) {
      counts[type] = 0;
    }

    /* Note: ++ needs is intended to be postfixed! */
    return counts[type]++;
  }

  function count(node) {
    return has(counts, node.tagName) ? counts[node.tagName] : 0;
  }
}
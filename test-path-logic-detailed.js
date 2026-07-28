// Detailed test with exact response structure
// This reflects the ACTUAL paths in the response

function getIntermediatePaths(paths) {
  const intermediates = new Set();
  
  paths.forEach((path) => {
    const parts = path.split('.').filter(Boolean);
    let current = '';
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      
      if (current === '') {
        current = part;
      } else if (part.startsWith('[')) {
        current += '.' + part;
      } else {
        current += '.' + part;
      }
      
      intermediates.add(current);
    }
  });
  
  return Array.from(intermediates);
}

function getPathAncestors(path) {
  const ancestors = [];
  const parts = path.split('.').filter(Boolean);
  
  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    
    if (current === '') {
      current = part;
    } else {
      current += '.' + part;
    }
    
    if (!ancestors.includes(current)) {
      ancestors.push(current);
    }
  }
  
  return ancestors;
}

// ACTUAL PATHS FROM THE RESPONSE - The real array structure
const actualPaths = [
  'body.[*].containerDimensionsType.containerType',
  'body.[*].containerDimensionsType.height',
  'body.[*].containerDimensionsType.id',
  'body.[*].containerDimensionsType.length',
  'body.[*].containerDimensionsType.name',
  'body.[*].containerDimensionsType.weight',
  'body.[*].containerDimensionsType.width',
  'body.[*].containerId',
  'body.[*].creationTime',
  'body.[*].currentAttemptsNumber',
  'body.[*].currentPosition.latitude',
  'body.[*].currentPosition.longitude',
  'body.[*].destination.latitude',
  'body.[*].destination.longitude',
  'body.[*].details',
];

console.log('=== ACTUAL PATHS FROM RESPONSE ===');
console.log(actualPaths);
console.log('\n');

// Generate intermediates
const intermediates = getIntermediatePaths(actualPaths);
console.log('=== INTERMEDIATE PATHS ===');
console.log(intermediates);
console.log('\n');

// Build suggestedPaths like the app does
const suggestedPaths = ['body', 'body.[*]', ...intermediates, ...actualPaths];
const uniqueSuggested = [...new Set(suggestedPaths)];

console.log('=== SUGGESTED PATHS (FINAL) ===');
console.log('Total paths:', uniqueSuggested.length);
uniqueSuggested.forEach(p => console.log(`  - ${p}`));
console.log('\n');

// TEST SCENARIO 1: User marks containerType (child of containerDimensionsType)
console.log('=== TEST 1: Mark containerType (child of containerDimensionsType) ===');
const markedPath1 = 'body.[*].containerDimensionsType.containerType';
console.log(`Mark: "${markedPath1}"`);

const ancestors1 = getPathAncestors(markedPath1);
console.log('Ancestors generated:', ancestors1);
console.log('\nCheck if ancestors exist in suggestedPaths:');

let allFound1 = true;
ancestors1.forEach(ancestor => {
  const exists = uniqueSuggested.includes(ancestor);
  console.log(`  "${ancestor}": ${exists ? '✓ FOUND' : '✗ NOT FOUND'}`);
  if (!exists) allFound1 = false;
});

console.log(allFound1 ? '\n✓ SUCCESS: All ancestors will be marked\n' : '\n✗ FAILURE: Some ancestors missing!\n');

// TEST SCENARIO 2: User marks containerId (direct child of [*])
console.log('=== TEST 2: Mark containerId (direct child of [*]) ===');
const markedPath2 = 'body.[*].containerId';
console.log(`Mark: "${markedPath2}"`);

const ancestors2 = getPathAncestors(markedPath2);
console.log('Ancestors generated:', ancestors2);
console.log('\nCheck if ancestors exist in suggestedPaths:');

let allFound2 = true;
ancestors2.forEach(ancestor => {
  const exists = uniqueSuggested.includes(ancestor);
  console.log(`  "${ancestor}": ${exists ? '✓ FOUND' : '✗ NOT FOUND'}`);
  if (!exists) allFound2 = false;
});

console.log(allFound2 ? '\n✓ SUCCESS: All ancestors will be marked\n' : '\n✗ FAILURE: Some ancestors missing!\n');

// TEST SCENARIO 3: User marks currentPosition.latitude (nested object)
console.log('=== TEST 3: Mark currentPosition.latitude (nested object) ===');
const markedPath3 = 'body.[*].currentPosition.latitude';
console.log(`Mark: "${markedPath3}"`);

const ancestors3 = getPathAncestors(markedPath3);
console.log('Ancestors generated:', ancestors3);
console.log('\nCheck if ancestors exist in suggestedPaths:');

let allFound3 = true;
ancestors3.forEach(ancestor => {
  const exists = uniqueSuggested.includes(ancestor);
  console.log(`  "${ancestor}": ${exists ? '✓ FOUND' : '✗ NOT FOUND'}`);
  if (!exists) allFound3 = false;
});

console.log(allFound3 ? '\n✓ SUCCESS: All ancestors will be marked\n' : '\n✗ FAILURE: Some ancestors missing!\n');

// FINAL CHECK
console.log('=== CRITICAL PATH CHECK ===');
console.log('Is "body.[*].containerDimensionsType" in suggestedPaths?', 
  uniqueSuggested.includes('body.[*].containerDimensionsType') ? '✓ YES' : '✗ NO');
console.log('Is "body.[*].currentPosition" in suggestedPaths?', 
  uniqueSuggested.includes('body.[*].currentPosition') ? '✓ YES' : '✗ NO');
console.log('Is "body.[*].destination" in suggestedPaths?', 
  uniqueSuggested.includes('body.[*].destination') ? '✓ YES' : '✗ NO');

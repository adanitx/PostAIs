// Simulate exact toggleSampleScriptPath flow

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

function getPathDescendants(path, allPaths) {
  const results = [path];
  const pathWithDot = path.endsWith('.') ? path : `${path}.`;
  const pathWithBracket = path.endsWith('.') ? path.slice(0, -1) + '.[' : `${path}.[`;
  
  allPaths.forEach((p) => {
    if (p !== path && (p.startsWith(pathWithDot) || p.startsWith(pathWithBracket))) {
      if (!results.includes(p)) {
        results.push(p);
      }
    }
  });
  
  return results;
}

// Exact response paths
const leafPaths = [
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

// Build suggestedPaths like the app does
const intermediates = getIntermediatePaths(leafPaths);
const suggestedPaths = ['body', 'body.[*]', ...intermediates, ...leafPaths];
const uniqueSuggestedPaths = [...new Set(suggestedPaths)];

console.log('=== SETUP: suggestedPaths ready ===');
console.log('Total paths:', uniqueSuggestedPaths.length);
console.log('\n');

// Start with empty selection
let selectedPaths = [];

// TEST: User clicks on containerType checkbox
const clickedPath = 'body.[*].containerDimensionsType.containerType';

console.log(`=== USER CLICKS: ${clickedPath} ===\n`);

// Get descendants
const descendants = getPathDescendants(clickedPath, uniqueSuggestedPaths);
console.log('1. Get descendants of clicked path:');
console.log('   Descendants:', descendants);

// Get ancestors
const ancestors = getPathAncestors(clickedPath);
console.log('\n2. Get ancestors of clicked path:');
console.log('   Ancestors:', ancestors);

// Build new selection
let newSelectedPaths = [...selectedPaths];

// Add the path itself
newSelectedPaths.push(clickedPath);
console.log('\n3. Add path itself:');
console.log('   Current selected:', newSelectedPaths);

// Add all descendants
descendants.forEach((d) => {
  if (!newSelectedPaths.includes(d)) {
    newSelectedPaths.push(d);
  }
});
console.log('\n4. Add all descendants:');
console.log('   Current selected:', newSelectedPaths);

// Add all ancestors
ancestors.forEach((ancestor) => {
  if (!newSelectedPaths.includes(ancestor)) {
    newSelectedPaths.push(ancestor);
  }
});
console.log('\n5. Add all ancestors:');
console.log('   Current selected:', newSelectedPaths);

// Final check
console.log('\n=== FINAL RESULT ===');
console.log('Should containerDimensionsType be selected?');
const containerDimPath = 'body.[*].containerDimensionsType';
const isSelected = newSelectedPaths.includes(containerDimPath);
console.log(`"${containerDimPath}": ${isSelected ? '✓ YES - Selected' : '✗ NO - Not selected'}`);

console.log('\nExpected in selectedPaths:');
[
  'body.[*].containerDimensionsType.containerType',
  'body.[*].containerDimensionsType',
  'body.[*]',
  'body'
].forEach(p => {
  const found = newSelectedPaths.includes(p);
  console.log(`  "${p}": ${found ? '✓' : '✗'}`);
});

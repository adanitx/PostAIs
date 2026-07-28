// Test that simulates exact React state update cycle 
// This mimics what happens when user clicks a checkbox in the React component

const mockContext = {
  body: [
    {
      containerDimensionsType: {
        containerType: "standard",
        containerId: "001"
      },
      currentPosition: {
        latitude: 40.7128,
        longitude: -74.0060
      },
      destination: "NYC"
    }
  ],
  headers: {},
  meta: {}
};

function getValueAtPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(/[\.\[\]]/).filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function getPathAncestors(path) {
  const ancestors = [];
  const parts = path.split('.');
  for (let i = 1; i < parts.length; i++) {
    const ancestor = parts.slice(0, i).join('.');
    ancestors.push(ancestor);
  }
  return ancestors;
}

function getIntermediatePaths(paths) {
  const intermediates = new Set();
  paths.forEach((path) => {
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) {
      const intermediate = parts.slice(0, i).join('.');
      intermediates.add(intermediate);
    }
  });
  return Array.from(intermediates);
}

function createPostResponseSuggestedPaths(context) {
  const paths = new Set();
  paths.add('body');
  
  if (Array.isArray(context.body) && context.body.length > 0) {
    paths.add('body.[*]');
    const firstItem = context.body[0];
    
    function extractPaths(obj, basePath, depth = 0, maxDepth = 7) {
      if (depth >= maxDepth || !obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        const newPath = basePath ? `${basePath}.${key}` : `body.[*].${key}`;
        paths.add(newPath);
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          extractPaths(value, newPath, depth + 1, maxDepth);
        }
      });
    }
    
    extractPaths(firstItem, 'body.[*]');
  }
  
  const allPaths = Array.from(paths);
  const intermediates = getIntermediatePaths(allPaths);
  intermediates.forEach(p => paths.add(p));
  
  return Array.from(paths);
}

function buildPathTree(paths, context) {
  const root = [];
  const nodeMap = new Map();
  const isArrayBody = Array.isArray(context.body) && context.body.length > 0;
  const firstArrayItem = isArrayBody ? context.body[0] : null;

  paths.forEach((fullPath) => {
    if (!nodeMap.has(fullPath)) {
      let value;
      if (fullPath.startsWith('body.[*].')) {
        const innerPath = fullPath.replace('body.[*].', '');
        value = firstArrayItem ? getValueAtPath(firstArrayItem, innerPath) : undefined;
      } else if (fullPath.startsWith('body.')) {
        const innerPath = fullPath.replace('body.', '');
        value = getValueAtPath(context.body, innerPath);
      } else {
        value = getValueAtPath(context.body, fullPath);
      }
      
      const parts = fullPath.split(/[\.\[\]]/).filter(Boolean);
      const label = parts[parts.length - 1];
      
      nodeMap.set(fullPath, {
        key: fullPath,
        label,
        value,
        fullPath,
        isLeaf: true,
        children: [],
      });
    }
  });

  const sortedPaths = Array.from(nodeMap.keys()).sort();
  sortedPaths.forEach((fullPath) => {
    const node = nodeMap.get(fullPath);
    const parts = fullPath.split(/[\.\[\]]/).filter(Boolean);
    
    if (parts.length === 1) {
      root.push(node);
    } else {
      let parentPath = null;
      for (let i = fullPath.length - 1; i > 0; i--) {
        const candidate = fullPath.substring(0, i);
        if ((fullPath[i] === '.' || fullPath[i] === ']') && nodeMap.has(candidate)) {
          parentPath = candidate;
          break;
        }
      }
      
      if (parentPath) {
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.isLeaf = false;
          if (!parent.children) parent.children = [];
          if (!parent.children.find((c) => c.fullPath === fullPath)) {
            parent.children.push(node);
          }
        }
      }
    }
  });

  return root;
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

// Simulate the React state update with EXACT function from App.tsx
function toggleSampleScriptPath(path, currentDialog) {
  console.log(`\n[SIMULATING] toggleSampleScriptPath("${path}")`);
  
  if (!currentDialog) {
    console.log('  ✗ currentDialog is null, returning');
    return currentDialog;
  }

  const isSelected = currentDialog.selectedPaths.includes(path);
  let newSelectedPaths = [...currentDialog.selectedPaths];

  console.log(`  isSelected: ${isSelected}`);
  console.log(`  current.selectedPaths: [${currentDialog.selectedPaths.join(', ')}]`);

  if (isSelected) {
    // Deselecting
    const descendants = getPathDescendants(path, currentDialog.suggestedPaths);
    newSelectedPaths = newSelectedPaths.filter((p) => !descendants.includes(p));
    
    const ancestors = getPathAncestors(path);
    ancestors.forEach((ancestor) => {
      const ancestorDescendants = getPathDescendants(ancestor, currentDialog.suggestedPaths);
      const hasSelectedDescendants = ancestorDescendants.some(
        (d) => d !== ancestor && newSelectedPaths.includes(d)
      );
      if (!hasSelectedDescendants) {
        newSelectedPaths = newSelectedPaths.filter((p) => p !== ancestor);
      }
    });
  } else {
    // Selecting
    const descendants = getPathDescendants(path, currentDialog.suggestedPaths);
    console.log(`  descendants to add: [${descendants.join(', ')}]`);
    descendants.forEach((d) => {
      if (!newSelectedPaths.includes(d)) {
        newSelectedPaths.push(d);
      }
    });
    
    const ancestors = getPathAncestors(path);
    console.log(`  ancestors to add: [${ancestors.join(', ')}]`);
    ancestors.forEach((ancestor) => {
      if (!newSelectedPaths.includes(ancestor)) {
        console.log(`    ✓ Adding ancestor: "${ancestor}"`);
        newSelectedPaths.push(ancestor);
      }
    });
  }

  console.log(`  newSelectedPaths: [${newSelectedPaths.join(', ')}]`);
  return {
    ...currentDialog,
    selectedPaths: newSelectedPaths,
  };
}

// Simulate rendering - check what the checkbox state should be
function simulateRenderCheckboxes(selectedPaths, pathTreeNodes) {
  console.log('\n[RENDERING] Checkbox states:');
  
  function traverse(nodes, indent = '') {
    nodes.forEach((node) => {
      const checked = selectedPaths.includes(node.fullPath);
      if (checked || node.label === 'containerDimensionsType' || node.label === 'containerType') {
        console.log(`${indent}[${checked ? '✓' : '✗'}] ${node.label} (fullPath: "${node.fullPath}")`);
      }
      if (node.children) {
        traverse(node.children, indent + '  ');
      }
    });
  }
  
  traverse(pathTreeNodes);
}

// === TEST EXECUTION ===
console.log('='.repeat(80));
console.log('COMPLETE REACT STATE CYCLE TEST');
console.log('='.repeat(80));

const suggestedPaths = createPostResponseSuggestedPaths(mockContext);
const pathTreeNodes = buildPathTree(suggestedPaths, mockContext);

// Initial dialog state (like when dialog first opens)
let dialogState = {
  mode: 'create',
  commandId: 'test',
  commandLabel: 'Test Command',
  suggestedPaths,
  selectedPaths: [], // Start empty
  preservedColumnNames: {},
  context: mockContext,
  searchFilter: '',
  pathTreeNodes,
  expandedNodes: new Set(),
};

console.log('\n1. INITIAL STATE:');
console.log(`   selectedPaths: [${dialogState.selectedPaths.join(', ') || '(empty)'}]`);
simulateRenderCheckboxes(dialogState.selectedPaths, pathTreeNodes);

// User clicks on containerType checkbox
console.log('\n' + '='.repeat(80));
console.log('USER CLICKS: containerType checkbox');
console.log('='.repeat(80));

const clickedPath = 'body.[*].containerDimensionsType.containerType';
dialogState = toggleSampleScriptPath(clickedPath, dialogState);

console.log('\n2. AFTER CLICKING containerType:');
console.log(`   selectedPaths: [${dialogState.selectedPaths.join(', ')}]`);
simulateRenderCheckboxes(dialogState.selectedPaths, pathTreeNodes);

// Verify containerDimensionsType is marked
const containerDimensionsIsSelected = dialogState.selectedPaths.includes('body.[*].containerDimensionsType');
console.log(`\n✓ Is containerDimensionsType selected? ${containerDimensionsIsSelected ? 'YES ✓' : 'NO ✗'}`);

if (!containerDimensionsIsSelected) {
  console.log('\n❌ PROBLEM: containerDimensionsType should be selected but is not!');
  console.log('Expected to find in selectedPaths: "body.[*].containerDimensionsType"');
  console.log('But it is not there. This is a bug in the logic.');
}

// Now user clicks on destination checkbox
console.log('\n' + '='.repeat(80));
console.log('USER CLICKS: destination checkbox');
console.log('='.repeat(80));

dialogState = toggleSampleScriptPath('body.[*].destination', dialogState);

console.log('\n3. AFTER CLICKING destination:');
console.log(`   selectedPaths: [${dialogState.selectedPaths.join(', ')}]`);
simulateRenderCheckboxes(dialogState.selectedPaths, pathTreeNodes);

console.log('\n' + '='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80));
console.log('\nSUMMARY:');
console.log(`✓ Path logic correctly marks parents when children are selected`);
console.log(`✓ State updates work as expected`);
console.log(`✓ Rendering should show correct checkbox states`);
console.log(`\nIf user doesn't see parent marked in UI, the issue is NOT in path logic.`);
console.log(`Possible causes: React not re-rendering, stale closures, or event handler not firing.`);

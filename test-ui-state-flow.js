// Test the complete UI state flow with path matching debugging

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

// All functions from App.tsx
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
  
  // Add intermediate paths
  const allPaths = Array.from(paths);
  const intermediates = getIntermediatePaths(allPaths);
  intermediates.forEach(p => paths.add(p));
  
  return Array.from(paths);
}

// Build the tree structure exactly as in App.tsx
function buildPathTree(paths, context) {
  const root = [];
  const nodeMap = new Map();
  const isArrayBody = Array.isArray(context.body) && context.body.length > 0;
  const firstArrayItem = isArrayBody ? context.body[0] : null;

  // First pass: create all nodes
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

  // Build parent-child relationships
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

// Simulate toggleSampleScriptPath
function simulateTogglePath(path, currentSelectedPaths, suggestedPaths) {
  const isSelected = currentSelectedPaths.includes(path);
  let newSelectedPaths = [...currentSelectedPaths];

  if (isSelected) {
    console.log(`  ❌ Deselecting ${path}`);
    const descendants = getPathDescendants(path, suggestedPaths);
    newSelectedPaths = newSelectedPaths.filter((p) => !descendants.includes(p));
    
    const ancestors = getPathAncestors(path);
    ancestors.forEach((ancestor) => {
      const ancestorDescendants = getPathDescendants(ancestor, suggestedPaths);
      const hasSelectedDescendants = ancestorDescendants.some(
        (d) => d !== ancestor && newSelectedPaths.includes(d)
      );
      if (!hasSelectedDescendants) {
        newSelectedPaths = newSelectedPaths.filter((p) => p !== ancestor);
      }
    });
  } else {
    console.log(`  ✓ Selecting ${path}`);
    const descendants = getPathDescendants(path, suggestedPaths);
    console.log(`    Found ${descendants.length} descendants (including itself)`);
    descendants.forEach((d) => {
      if (!newSelectedPaths.includes(d)) {
        newSelectedPaths.push(d);
      }
    });
    
    const ancestors = getPathAncestors(path);
    console.log(`    Found ${ancestors.length} ancestors`);
    ancestors.forEach((ancestor) => {
      if (!newSelectedPaths.includes(ancestor)) {
        console.log(`      Adding ancestor: ${ancestor}`);
        newSelectedPaths.push(ancestor);
      }
    });
  }

  return newSelectedPaths;
}

// === TEST START ===
console.log('='.repeat(80));
console.log('TEST: Building tree and checking path matching');
console.log('='.repeat(80));

const suggestedPaths = createPostResponseSuggestedPaths(mockContext);
console.log('\n1. Suggested Paths:');
suggestedPaths.forEach((p, i) => console.log(`   ${i + 1}. "${p}"`));

const pathTreeNodes = buildPathTree(suggestedPaths, mockContext);
console.log('\n2. Tree Structure (showing fullPath for each node):');

function printTree(nodes, indent = '') {
  nodes.forEach((node) => {
    console.log(`${indent}node.fullPath: "${node.fullPath}" (label: "${node.label}", isLeaf: ${node.isLeaf})`);
    if (node.children && node.children.length > 0) {
      printTree(node.children, indent + '  ');
    }
  });
}
printTree(pathTreeNodes);

// Extract all node.fullPath values from the tree
function getAllNodePaths(nodes, acc = []) {
  nodes.forEach((node) => {
    acc.push(node.fullPath);
    if (node.children && node.children.length > 0) {
      getAllNodePaths(node.children, acc);
    }
  });
  return acc;
}

const allNodePaths = getAllNodePaths(pathTreeNodes);
console.log('\n3. All node.fullPath values in tree:');
allNodePaths.forEach((p, i) => console.log(`   ${i + 1}. "${p}"`));

// TEST: Click on containerType
console.log('\n' + '='.repeat(80));
console.log('USER ACTION: Click checkbox for containerType');
console.log('='.repeat(80));

const clickedPath = 'body.[*].containerDimensionsType.containerType';
console.log(`\nClicking path: "${clickedPath}"`);

// Check if this path exists in the tree
const pathExistsInTree = allNodePaths.includes(clickedPath);
console.log(`\nDoes "${clickedPath}" exist in tree nodes? ${pathExistsInTree ? '✓ YES' : '✗ NO'}`);

if (!pathExistsInTree) {
  console.log('\n⚠️ PROBLEM FOUND: Clicked path does not exist in tree nodes!');
  console.log('This would mean the checkbox click would not trigger because the node has fullPath that doesn\'t match.');
  
  // Find similar paths
  const similar = allNodePaths.filter(p => p.includes('containerType'));
  console.log(`\nPaths containing "containerType":`);
  similar.forEach(p => console.log(`  "${p}"`));
}

// Simulate the toggle
let currentSelectedPaths = [];
const newSelectedPaths = simulateTogglePath(clickedPath, currentSelectedPaths, suggestedPaths);

console.log(`\nResult after toggle:`);
newSelectedPaths.forEach((p, i) => console.log(`  ${i + 1}. "${p}"`));

// Check if containerDimensionsType would be marked
const containerDimensionsTypeIsSelected = newSelectedPaths.includes('body.[*].containerDimensionsType');
console.log(`\n✓ Is "body.[*].containerDimensionsType" selected? ${containerDimensionsTypeIsSelected ? 'YES ✓' : 'NO ✗'}`);

// Now simulate rendering: would the checkbox for containerDimensionsType show as checked?
console.log('\n' + '='.repeat(80));
console.log('RENDERING CHECK');
console.log('='.repeat(80));

// Find the node by fullPath
const containerDimensionsNode = (() => {
  function findNode(nodes, targetPath) {
    for (const node of nodes) {
      if (node.fullPath === targetPath) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findNode(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  }
  return findNode(pathTreeNodes, 'body.[*].containerDimensionsType');
})();

if (containerDimensionsNode) {
  console.log(`\nFound containerDimensionsNode:`);
  console.log(`  node.fullPath: "${containerDimensionsNode.fullPath}"`);
  console.log(`  node.label: "${containerDimensionsNode.label}"`);
  
  const wouldBeChecked = newSelectedPaths.includes(containerDimensionsNode.fullPath);
  console.log(`\nWould checkbox be checked? ${wouldBeChecked ? 'YES ✓' : 'NO ✗'}`);
  
  if (!wouldBeChecked) {
    console.log('\n⚠️ MISMATCH: selectedPaths does NOT include this node.fullPath');
    console.log(`Looking for: "${containerDimensionsNode.fullPath}"`);
    console.log(`In selectedPaths, we have:`);
    newSelectedPaths.forEach(p => {
      if (p.includes('containerDimensionsType')) {
        console.log(`  "${p}"`);
      }
    });
  }
} else {
  console.log('\n✗ Could not find containerDimensionsNode in tree');
}

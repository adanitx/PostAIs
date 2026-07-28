// Test to verify buildPathTree preserves path strings exactly

const mockContext = {
  body: [
    {
      containerDimensionsType: {
        containerType: "standard",
        containerId: "001"
      }
    }
  ]
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
  
  return Array.from(paths);
}

function buildPathTree(paths, context) {
  const root = [];
  const nodeMap = new Map();
  const isArrayBody = Array.isArray(context.body) && context.body.length > 0;
  const firstArrayItem = isArrayBody ? context.body[0] : null;

  // First pass: create all nodes from the exact paths provided
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
      
      const node = {
        key: fullPath,
        label,
        value,
        fullPath, // <-- IMPORTANT: must preserve exact string
        isLeaf: true,
        children: [],
      };
      
      nodeMap.set(fullPath, node);
    }
  });

  // Third pass: build parent-child relationships
  const sortedPaths = Array.from(nodeMap.keys()).sort();
  
  sortedPaths.forEach((fullPath) => {
    const node = nodeMap.get(fullPath);
    const parts = fullPath.split(/[\.\[\]]/).filter(Boolean);
    
    if (parts.length === 1) {
      // Root level
      root.push(node);
    } else {
      // Find parent by looking for the longest matching prefix in nodeMap
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

// === TEST ===
const suggestedPaths = createPostResponseSuggestedPaths(mockContext);
console.log('Input paths:');
suggestedPaths.forEach((p, i) => console.log(`  ${i}: "${p}"`));

const tree = buildPathTree(suggestedPaths, mockContext);

function getAllNodePaths(nodes, acc = []) {
  nodes.forEach((node) => {
    acc.push(node.fullPath);
    if (node.children && node.children.length > 0) {
      getAllNodePaths(node.children, acc);
    }
  });
  return acc;
}

const outputPaths = getAllNodePaths(tree);
console.log('\nOutput node.fullPath values:');
outputPaths.forEach((p, i) => console.log(`  ${i}: "${p}"`));

// Check if they're exactly the same
console.log('\n=== PATH COMPARISON ===');
suggestedPaths.forEach((inputPath) => {
  const found = outputPaths.find(p => p === inputPath);
  if (!found) {
    console.log(`✗ Input path NOT in output: "${inputPath}"`);
  } else {
    console.log(`✓ "${inputPath}" found in output`);
  }
});

// Check for extra paths in output
console.log('\n=== CHECK FOR EXTRA PATHS IN OUTPUT ===');
outputPaths.forEach((outputPath) => {
  if (!suggestedPaths.includes(outputPath)) {
    console.log(`⚠️ Extra path in output: "${outputPath}"`);
  }
});

// Test the specific case
console.log('\n=== SPECIFIC TEST ===');
const containerTypeNode = (() => {
  function find(nodes, target) {
    for (const node of nodes) {
      if (node.fullPath === target) return node;
      if (node.children) {
        const found = find(node.children, target);
        if (found) return found;
      }
    }
  }
  return find(tree, 'body.[*].containerDimensionsType.containerType');
})();

if (containerTypeNode) {
  console.log(`✓ Found containerTypeNode with fullPath: "${containerTypeNode.fullPath}"`);
  console.log(`  Parent path in output: "${containerTypeNode.fullPath.substring(0, containerTypeNode.fullPath.lastIndexOf('.'))}"`);
  
  const parentPath = 'body.[*].containerDimensionsType';
  const parentInOutput = outputPaths.includes(parentPath);
  console.log(`  Is parent "${parentPath}" in output? ${parentInOutput ? '✓ YES' : '✗ NO'}`);
  
  // Check what happens when we search for parent
  const exactMatch = outputPaths.find(p => p === parentPath);
  console.log(`  Exact match search result: ${exactMatch ? `"${exactMatch}"` : 'null'}`);
} else {
  console.log('✗ containerTypeNode NOT found in tree!');
}

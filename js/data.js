function getPodSizes(allEmployees) {
    const podSizes = {};
    allEmployees.forEach(emp => {
        if (emp.partner_relationship_id) {
            if (!podSizes[emp.partner_relationship_id]) {
                podSizes[emp.partner_relationship_id] = 0;
            }
            podSizes[emp.partner_relationship_id]++;
        }
    });
    return podSizes;
}

function getUniqueEmployees() {
    const allEmployeesMap = new Map();
    // The tree contains the most up-to-date data after moves, so process it first.
    flattenTree(currentGlobalPartnerTrees).forEach(emp => allEmployeesMap.set(emp.id, emp));
    // Then add any orphans who might not be in a tree (e.g. coach_id points to non-existent employee)
    currentOrphanedReport.forEach(emp => {
        if (!allEmployeesMap.has(emp.id)) {
            allEmployeesMap.set(emp.id, emp);
        }
    });
    return Array.from(allEmployeesMap.values());
}

function flattenTree(nodes) {
    let flat = [];
    function recurse(node) {
        flat.push(node.data ? node.data : node);
        if (node.children) {
            node.children.forEach(recurse);
        }
    }
    nodes.forEach(recurse);
    return flat;
}

function loadPodChangeLog() {
    const storedLog = localStorage.getItem(LOCAL_STORAGE_KEY_POD_MOVES);
    if (storedLog) {
        try {
            podChangeLog = JSON.parse(storedLog);
            if (!Array.isArray(podChangeLog)) podChangeLog = [];
        } catch (e) {
            podChangeLog = [];
        }
    }
}

function savePodChangeLog() {
    localStorage.setItem(LOCAL_STORAGE_KEY_POD_MOVES, JSON.stringify(podChangeLog));
}

function applyPodLoggedChanges() {
    const allEmployees = getUniqueEmployees();
    podChangeLog.forEach(log => {
        const employee = allEmployees.find(e => e.id === log.moved_employee_id);
        if (employee) {
            employee.partner_relationship_id = log.new_partner_id;
            employee.partner_relationship_name = log.new_partner_name;
            employee.is_pod_relationship_valid = true;
            employee.pod_relationship_status = 'valid';
        }
    });
}

function findNodeById(roots, nodeId) {
    if (!nodeId) return null;
    for (let root of roots) {
        const found = findNodeRecursive(root, nodeId);
        if (found) return found;
    }
    return null;
}

function findNodeRecursive(node, nodeId) {
    if (!node) return null; 
    if (node.id === nodeId) {
        return node;
    }
    if (node.children) {
        for (let child of node.children) {
            const found = findNodeRecursive(child, nodeId);
            if (found) return found;
        }
    }
    return null;
}

function countAllDescendants(node) {
    let count = 0;
    if (node.children && node.children.length > 0) {
        count += node.children.length; 
        for (let child of node.children) {
            count += countAllDescendants(child); 
        }
    }
    return count;
}

function loadChangeLog() {
    const storedLog = localStorage.getItem(LOCAL_STORAGE_KEY_MOVES);
    if (storedLog) {
        try {
            changeLog = JSON.parse(storedLog);
            if (!Array.isArray(changeLog)) changeLog = []; 
        } catch (e) {
            console.error("Error parsing change log from localStorage:", e);
            changeLog = [];
        }
    } else {
        changeLog = [];
    }
}

function saveChangeLog() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_MOVES, JSON.stringify(changeLog));
    } catch (e) {
        console.error("Error saving change log to localStorage:", e);
        alert("Could not save changes. Local storage might be full.");
    }
}

function applyLoggedChanges() {
    if (changeLog.length === 0) return;

    changeLog.forEach(log => {
        const employeeNode = findNodeById(currentGlobalPartnerTrees, log.moved_employee_id);
        const newCoachNode = findNodeById(currentGlobalPartnerTrees, log.new_coach_id);
        let oldCoachNode = null;
        if (log.original_coach_id) { 
            oldCoachNode = findNodeById(currentGlobalPartnerTrees, log.original_coach_id);
        }

        if (employeeNode && newCoachNode) {
            if (oldCoachNode && oldCoachNode.children) {
                const index = oldCoachNode.children.findIndex(child => child.id === employeeNode.id);
                if (index > -1) {
                    oldCoachNode.children.splice(index, 1);
                }
            }
            
            if (!newCoachNode.children) newCoachNode.children = [];
            if (!newCoachNode.children.find(c => c.id === employeeNode.id)) {
                 newCoachNode.children.push(employeeNode);
            }
            employeeNode.coach_id = log.new_coach_id; 
        } else {
            console.warn("Could not apply a logged change during initial load; employee, old coach, or new coach not found:", log);
        }
    });

    currentGlobalPartnerTrees.forEach(root => {
        if (root.level === PARTNER_LEVEL_VALUE) { 
            root.indirect_coachee_count = countAllDescendants(root);
        }
    });
    currentGlobalPartnerTrees.forEach(updateDirectCountsRecursive); 
}

function updateDirectCountsRecursive(node) {
     node.direct_coachee_count = node.children ? node.children.length : 0;
    if (node.children) {
        node.children.forEach(updateDirectCountsRecursive);
    }
}
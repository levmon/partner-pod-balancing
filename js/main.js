const margin = { top: 20, right: 120, bottom: 20, left: 120 };
let svg, g, zoom, currentGlobalPartnerTrees, currentOrphanedReport, currentRoot, treeLayout, currentRootPartnerLocation, currentSelectedOU;
let i = 0; 
const duration = 750; 

// --- Variables for Move Employee Feature ---
let moveEmployeeModal, closeMoveModalButton, confirmMoveButton, cancelMoveButton, newPartnerSelector, moveModalTitle, moveEmployeeInfo;
let currentEmployeeToMoveD3Node = null; 
let changeLog = [];
let podChangeLog = [];
const LOCAL_STORAGE_KEY_MOVES = 'coachingForestMovesLog';
const LOCAL_STORAGE_KEY_POD_MOVES = 'coachingForestPodMovesLog';
const PARTNER_LEVEL_VALUE = 'Partner';

// --- DOM Elements for Move Employee Feature & Context Menu ---
let tempMovesLogTableBody, clearTempMovesButton;
let customContextMenu, contextMenuMoveItem;
let contextMenuTargetNode = null;

// --- Variables for Move Pod Member Feature ---
let movePodMemberModal, closeMovePodModalButton, confirmPodMoveButton, cancelPodMoveButton, newPodPartnerSelector, movePodModalTitle, movePodMemberInfo;
let currentEmployeeToMovePod = null;

// --- Style Configuration ---
const config = {
    colors: {
        link: "#ccc", 
        nodeStrokeSameLocation: "steelblue", 
        nodeStrokeDifferentLocation: "purple", 
        nodeFillSameOU: "#fff",       
        nodeFillDifferentOU: "orange" 
    }
};
// --- End Style Configuration ---

const tooltip = d3.select("#metadata-tooltip");

// Load data and initialize visualization
d3.json("forest.json?" + new Date().getTime()).then(async function(data) { 
    // --- Initialize Coach Move Elements ---
    moveEmployeeModal = document.getElementById('moveEmployeeModal');
    const coachMoveCloseButton = moveEmployeeModal.querySelector('.close-button');
    const coachMoveConfirmButton = moveEmployeeModal.querySelector('#confirmMoveButton');
    const coachMoveCancelButton = moveEmployeeModal.querySelector('#cancelMoveButton');
    newPartnerSelector = document.getElementById('newPartnerSelector');
    moveModalTitle = document.getElementById('moveModalTitle');
    moveEmployeeInfo = document.getElementById('moveEmployeeInfo');
    tempMovesLogTableBody = document.querySelector("#temp-moves-log-table tbody");
    clearTempMovesButton = document.getElementById('clear-temp-moves-button');
    customContextMenu = document.getElementById('customContextMenu');
    contextMenuMoveItem = document.getElementById('contextMenuMoveItem');

    // --- Initialize Pod Move Elements ---
    movePodMemberModal = document.getElementById('movePodMemberModal');
    const podMoveCloseButton = movePodMemberModal.querySelector('.close-button');
    const podMoveConfirmButton = movePodMemberModal.querySelector('#confirmPodMoveButton');
    const podMoveCancelButton = movePodMemberModal.querySelector('#cancelPodMoveButton');
    newPodPartnerSelector = document.getElementById('newPodPartnerSelector');
    movePodModalTitle = document.getElementById('movePodModalTitle');
    movePodMemberInfo = document.getElementById('movePodMemberInfo');
    
    // --- Assign Event Listeners ---
    coachMoveCloseButton.onclick = () => { moveEmployeeModal.style.display = "none"; };
    coachMoveCancelButton.onclick = () => { moveEmployeeModal.style.display = "none"; };
    coachMoveConfirmButton.onclick = confirmMove; 
    clearTempMovesButton.onclick = clearTemporaryMoves; 

    podMoveCloseButton.onclick = () => { movePodMemberModal.style.display = "none"; };
    podMoveCancelButton.onclick = () => { movePodMemberModal.style.display = "none"; };
    podMoveConfirmButton.onclick = confirmPodMove;
    document.getElementById('clear-pod-moves-button').onclick = clearPodMoves;

    contextMenuMoveItem.onclick = function() {
        if (contextMenuTargetNode) {
            showMoveEmployeeModal(contextMenuTargetNode);
        }
        customContextMenu.style.display = 'none';
        contextMenuTargetNode = null;
    };

    window.addEventListener('click', function(event) { 
        customContextMenu.style.display = 'none';
        contextMenuTargetNode = null;
        if (event.target == moveEmployeeModal) {
            moveEmployeeModal.style.display = "none";
        }
         if (event.target == movePodMemberModal) {
            movePodMemberModal.style.display = "none";
        }
    });
     window.addEventListener('keydown', function(event) { 
        if (event.key === 'Escape') {
            customContextMenu.style.display = 'none';
            contextMenuTargetNode = null;
        }
    });

    // --- Load Data ---
    if (!data || !data.all_partner_trees || data.all_partner_trees.length === 0) {
        console.error("No 'all_partner_trees' data found in forest.json or it is empty.");
        d3.select("#chart-container").text("Error: No Partner tree data to display. Check forest.json.");
        currentOrphanedReport = (data && data.all_orphaned_employees) ? data.all_orphaned_employees : [];
    } else {
         currentGlobalPartnerTrees = (data && data.all_partner_trees) ? data.all_partner_trees : [];
         currentOrphanedReport = (data && data.all_orphaned_employees) ? data.all_orphaned_employees : [];
    }

    // --- Apply Changes and Render ---
    loadChangeLog();
    loadPodChangeLog();
    applyLoggedChanges();
    applyPodLoggedChanges();

    populateOUSelector(currentGlobalPartnerTrees); 
    currentSelectedOU = d3.select("#ou-selector").property("value"); 
    filterAndDisplayData(); 

    updateOrphanedReportDisplay();
    const allEmployeesForPods = getUniqueEmployees();
    renderPartnerPods(allEmployeesForPods, currentGlobalPartnerTrees);
    renderChangeLogTable();
    renderPodChangeLogTable();

    d3.select("#ou-selector").on("change", function() {
        currentSelectedOU = d3.select(this).property("value");
        filterAndDisplayData();
        updateOrphanedReportDisplay();
        const allEmployeesForPods = getUniqueEmployees();
        renderPartnerPods(allEmployeesForPods, currentGlobalPartnerTrees);
    });
    
    d3.select("#tree-selector").on("change", function() {
        const selectedTreeId = d3.select(this).property("value");
        const selectedPartnerData = findNodeById(currentGlobalPartnerTrees, selectedTreeId); 
        if (selectedPartnerData && selectedPartnerData['Operating Unit Name'] === currentSelectedOU) {
            loadTree(selectedPartnerData);
        } else if (currentGlobalPartnerTrees.find(p => p.id === selectedTreeId && p['Operating Unit Name'] === currentSelectedOU)) {
             loadTree(currentGlobalPartnerTrees.find(p => p.id === selectedTreeId && p['Operating Unit Name'] === currentSelectedOU));
        }
    });

}).catch(function(error) {
    console.error("Error loading or processing forest.json:", error);
    d3.select("#partnerTreesTab").html("Error loading forest.json. See console for details.");
    d3.select("#orphanedTnTTab").html("Error loading forest.json. See console for details.");
    d3.select("#tempMovesLogTab").html("Error loading forest.json. See console for details.");
});

function confirmMove() {
    const newPartnerId = newPartnerSelector.value;
    if (!currentEmployeeToMoveD3Node || !newPartnerId) {
        alert("Please select an employee and a new partner.");
        return;
    }
    
    const employeeToMoveData = currentEmployeeToMoveD3Node.data; 
    const employeeToMoveId = employeeToMoveData.id;

    console.log(`Attempting to move ${employeeToMoveData.name} (ID: ${employeeToMoveId}) to new Partner ID: ${newPartnerId}`);

    const originalCoachId = employeeToMoveData.coach_id;
    let originalCoachNode = null;
    if (originalCoachId) {
         originalCoachNode = findNodeById(currentGlobalPartnerTrees, originalCoachId);
    }
    
    const newCoachNode = findNodeById(currentGlobalPartnerTrees, newPartnerId);
    const employeeNodeInMemory = findNodeById(currentGlobalPartnerTrees, employeeToMoveId);

    if (!employeeNodeInMemory) {
        console.error("Could not find the employee to move in the current data structure.");
        alert("Error: Could not find the employee to move. Please refresh.");
        moveEmployeeModal.style.display = "none";
        currentEmployeeToMoveD3Node = null;
        return;
    }
    if (!newCoachNode) {
        console.error("Could not find the new coach in the current data structure.");
        alert("Error: Could not find the new coach. Please refresh.");
        moveEmployeeModal.style.display = "none";
        currentEmployeeToMoveD3Node = null;
        return;
    }

    if (isDescendant(employeeNodeInMemory, newCoachNode)) {
         alert(`Error: Cannot move ${employeeToMoveData.name} under ${newCoachNode.name} as ${newCoachNode.name} is a descendant of ${employeeToMoveData.name}.`);
         moveEmployeeModal.style.display = "none";
         currentEmployeeToMoveD3Node = null;
         return;
    }

    if (originalCoachNode && originalCoachNode.children) {
        const indexInOldCoach = originalCoachNode.children.findIndex(child => child.id === employeeToMoveId);
        if (indexInOldCoach > -1) {
            originalCoachNode.children.splice(indexInOldCoach, 1);
        }
    } else if (!originalCoachId && employeeNodeInMemory.level !== PARTNER_LEVEL_VALUE) { 
         console.warn(`Employee ${employeeToMoveId} had no original coach ID but is not a partner, or is a partner being moved.`);
    }

    if (!newCoachNode.children) {
        newCoachNode.children = [];
    }
    if (!newCoachNode.children.find(c => c.id === employeeToMoveId)) {
        newCoachNode.children.push(employeeNodeInMemory);
    }
    
    employeeNodeInMemory.coach_id = newPartnerId;

    if (originalCoachNode) {
        originalCoachNode.direct_coachee_count = originalCoachNode.children ? originalCoachNode.children.length : 0;
    }
    newCoachNode.direct_coachee_count = newCoachNode.children ? newCoachNode.children.length : 0;
    
    currentGlobalPartnerTrees.forEach(root => {
        if (root.level === PARTNER_LEVEL_VALUE) {
            root.indirect_coachee_count = countAllDescendants(root);
        }
    });
    currentGlobalPartnerTrees.forEach(updateDirectCountsRecursive);

    const logEntry = {
        moved_employee_id: employeeToMoveId,
        moved_employee_name: employeeToMoveData.name,
        original_coach_id: originalCoachId || null, 
        original_coach_name: originalCoachNode ? originalCoachNode.name : "N/A (was a root or no coach)",
        new_coach_id: newPartnerId,
        new_coach_name: newCoachNode.name,
        timestamp: new Date().toISOString()
    };
    changeLog.push(logEntry);

    saveChangeLog();
    renderChangeLogTable();

    const previouslySelectedPartnerIdInDropdown = d3.select("#tree-selector").property("value");
    refreshPartnerSelectorOptions(); 

    let treeToRefreshData = null;
    if (currentRoot) {
        if (currentRoot.data.id === previouslySelectedPartnerIdInDropdown) {
            treeToRefreshData = findNodeById(currentGlobalPartnerTrees, previouslySelectedPartnerIdInDropdown);
        } else if (newCoachNode.id === currentRoot.data.id) {
             treeToRefreshData = newCoachNode; 
        } else if (originalCoachNode && originalCoachNode.id === currentRoot.data.id) {
            treeToRefreshData = findNodeById(currentGlobalPartnerTrees, originalCoachNode.id); // Re-fetch originalCoachNode as its children changed
        }
    } else if (previouslySelectedPartnerIdInDropdown) { 
         treeToRefreshData = findNodeById(currentGlobalPartnerTrees, previouslySelectedPartnerIdInDropdown);
    }

    if (treeToRefreshData) {
        console.log("Refreshing tree for:", treeToRefreshData.name);
        loadTree(treeToRefreshData); 
    } else {
        if(previouslySelectedPartnerIdInDropdown){ // Ensure selection is maintained even if tree not reloaded
            d3.select("#tree-selector").property("value", previouslySelectedPartnerIdInDropdown);
        }
        console.log("Move complete. Currently displayed tree not directly affected or no tree displayed.");
    }

    console.log(`Move confirmed for ${employeeToMoveData.name} to partner ${newCoachNode.name}.`);
    moveEmployeeModal.style.display = "none";
    currentEmployeeToMoveD3Node = null;
}

function isDescendant(ancestorNode, potentialDescendant) {
    if (!ancestorNode || !potentialDescendant) return false;
    if (!ancestorNode.children || ancestorNode.children.length === 0) {
        return false;
    }
    for (let child of ancestorNode.children) {
        if (child.id === potentialDescendant.id) {
            return true;
        }
        if (isDescendant(child, potentialDescendant)) {
            return true;
        }
    }
    return false;
}
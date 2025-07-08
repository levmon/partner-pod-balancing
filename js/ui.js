function setupSvg() {
    d3.select("#coaching-tree-svg").selectAll("*").remove();
    svg = d3.select("#coaching-tree-svg"); 
    g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    zoom = d3.zoom()
        .scaleExtent([0.1, 3]) 
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });
    svg.call(zoom);
    d3.select("#reset-zoom").on("click", () => {
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(margin.left, margin.top).scale(1)
        );
    });
}

function switchView(viewName) {
    // Hide all main view content
    const viewContents = document.querySelectorAll('.view-content');
    viewContents.forEach(vc => vc.style.display = 'none');

    // Deactivate all main nav buttons
    const mainNavButtons = document.querySelectorAll('.main-nav-button');
    mainNavButtons.forEach(btn => btn.classList.remove('active'));

    // Show the selected view content
    document.getElementById(viewName).style.display = 'block';

    // Activate the selected main nav button
    document.getElementById(viewName.replace('View', '-view-btn')).classList.add('active');
}

function openTab(evt, tabName) {
    // Find the parent view-content container
    let parentView = evt.currentTarget.closest('.view-content');
    if (!parentView) {
        console.error("Tab button is not inside a .view-content container.");
        return;
    }

    // Get all tab content and buttons within the specific view
    const tabcontent = parentView.querySelectorAll(".tab-content");
    const tablinks = parentView.querySelectorAll(".tab-button");

    // Hide all tab content within this view
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Deactivate all tab buttons within this view
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    // Show the selected tab content and activate its button
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

function renderOrphanedReportTable(orphanedData) {
    const container = d3.select("#orphaned-table-container");
    container.selectAll("*").remove(); 

    if (!orphanedData || orphanedData.length === 0) {
        container.append("p").text("No employees found for this report based on the current data.");
        return;
    }

    const table = container.append("table");
    const thead = table.append("thead");
    const tbody = table.append("tbody");

    const columns = [
        { key: 'id', label: 'Employee ID' },
        { key: 'name', label: 'Name' },
        { key: 'level', label: 'Level' },
        { key: 'Operating Unit Name', label: 'Operating Unit' }, 
        { key: 'coach_id', label: 'Listed Coach ID' },
        { key: 'reason_for_listing', label: 'Reason' }
    ];

    thead.append("tr")
        .selectAll("th")
        .data(columns)
        .enter()
        .append("th")
        .text(d => d.label);

    const rows = tbody.selectAll("tr")
        .data(orphanedData)
        .enter()
        .append("tr");

    rows.selectAll("td")
        .data(d_row => { 
            return columns.map(col => {
                return { column: col.key, value: d_row[col.key] || "N/A" };
            });
        })
        .enter()
        .append("td")
        .text(d_cell => d_cell.value);
}

function populateOUSelector(allPartnerData) {
    const ouSelector = d3.select("#ou-selector");
    const operatingUnits = new Set();
    allPartnerData.forEach(partner => {
        if (partner['Operating Unit Name']) {
            operatingUnits.add(partner['Operating Unit Name']);
        }
    });

    ouSelector.selectAll("option").remove(); 

    const sortedOperatingUnits = Array.from(operatingUnits).sort();

    sortedOperatingUnits.forEach(ou => {
        ouSelector.append("option")
            .attr("value", ou)
            .text(ou);
    });

    if (sortedOperatingUnits.length > 0) {
        if (operatingUnits.has("T&T Artificial Intelligence & Data")) {
            ouSelector.property("value", "T&T Artificial Intelligence & Data");
        } else {
            ouSelector.property("value", sortedOperatingUnits[0]); 
        }
    } else {
         ouSelector.append("option").text("No Operating Units Found");
    }
    currentSelectedOU = ouSelector.property("value"); 
}

function filterAndDisplayData() {
    if (!currentSelectedOU) {
        d3.select("#tree-selector").html("<option>Select an Operating Unit</option>");
        d3.select("#chart-container").html('<p style="padding:20px;">Please select an Operating Unit to see partner trees.</p>');
        currentRoot = null;
        if (svg) g.selectAll("*").remove();
        return;
    }

    let filteredPartners = currentGlobalPartnerTrees.filter(partnerNode => 
        partnerNode['Operating Unit Name'] === currentSelectedOU && partnerNode.level === PARTNER_LEVEL_VALUE
    );

    filteredPartners.sort((a, b) => {
        const countA = typeof a.indirect_coachee_count !== 'undefined' ? a.indirect_coachee_count : -1;
        const countB = typeof b.indirect_coachee_count !== 'undefined' ? b.indirect_coachee_count : -1;
        return countB - countA;
    });

    if (filteredPartners.length === 0) {
        const message = `No Partners found for Operating Unit: ${currentSelectedOU}.`;
        console.warn(message);
        d3.select("#tree-selector").html(`<option>${message}</option>`);
        d3.select("#chart-container").html(`<p style="padding:20px;">${message}</p>`);
        currentRoot = null;
        if (svg) g.selectAll("*").remove();
    } else {
        populatePartnerSelector(filteredPartners);
        if (filteredPartners.length > 0) { 
            loadTree(filteredPartners[0]);
        }
    }
}

function updateOrphanedReportDisplay() {
    const orphanedTabButton = d3.select("#orphanedTabButton");
    const orphanedTitle = d3.select("#orphaned-title");
    const orphanedDescription = d3.select("#orphaned-description");
    const container = d3.select("#orphaned-table-container");

    orphanedTabButton.text('Orphaned'); 

    if (!currentSelectedOU) {
        orphanedTitle.text('Orphaned Employees Report');
        orphanedDescription.text('Please select an Operating Unit to view its orphaned employees.');
        container.html(''); 
        return;
    }

    const filteredOrphans = currentOrphanedReport.filter(emp => emp['Operating Unit Name'] === currentSelectedOU);
    
    orphanedTitle.text(`Orphaned Employees Report (${currentSelectedOU})`);

    if (filteredOrphans.length > 0) {
        orphanedDescription.text(`This report shows non-Partner employees from ${currentSelectedOU} whose coach is missing, invalid, or outside their Operating Unit.`);
        renderOrphanedReportTable(filteredOrphans);
    } else {
        orphanedDescription.text(`No orphaned employees found for ${currentSelectedOU}.`);
        container.html(''); 
    }
}

function renderPartnerPods(allEmployees, allPartners) {
    const container = d3.select("#pods-container");
    container.selectAll("*").remove();

    if (!currentSelectedOU) {
        container.html('<p>Please select an Operating Unit to view Partner Pods.</p>');
        return;
    }

    const ouPartners = allPartners.filter(p => p['Operating Unit Name'] === currentSelectedOU);
    const ouPartnerIds = new Set(ouPartners.map(p => p.id));

    const pods = {};
    ouPartnerIds.forEach(id => pods[id] = []); // Initialize all pods for the OU

    const errors = [];

    allEmployees.forEach(emp => {
        const podId = emp.partner_relationship_id;
        const status = emp.pod_relationship_status;

        // Add to a pod if their partner is in the currently selected OU
        if ((status === 'valid' || status === 'warning_different_offering') && ouPartnerIds.has(podId)) {
            pods[podId].push(emp);
        }

        // Add to the error list if they are FROM the current OU and have any non-valid status
        if (emp['Operating Unit Name'] === currentSelectedOU && status !== 'valid') {
            errors.push(emp);
        }
    });

    ouPartners.sort((a, b) => (pods[b.id] || []).length - (pods[a.id] || []).length);

    ouPartners.forEach(partner => {
        const podMembers = pods[partner.id] || [];
        const podContainer = container.append('div').attr('class', 'pod-container');
        const header = podContainer.append('div').attr('class', 'pod-header');

        header.append('span')
            .text(`${partner.name} (Pod Size: ${podMembers.length})`)
            .on('click', function(event) {
                event.stopPropagation();
                const content = d3.select(this.parentNode.parentNode).select('.pod-content');
                const isHidden = content.style('display') === 'none';
                content.style('display', isHidden ? 'block' : 'none');
            });
        
        const bulkMoveButton = header.append('button')
            .attr('class', 'bulk-move-button')
            .text('Bulk Move Selected')
            .on('click', function(event) {
                event.stopPropagation();
                const selectedEmployees = [];
                podContainer.selectAll('.pod-member-checkbox:checked').each(function(d) {
                    selectedEmployees.push(d);
                });
                if (selectedEmployees.length > 0) {
                    showMovePodModal(selectedEmployees);
                } else {
                    alert("Please select at least one employee to move.");
                }
            });

        const podContent = podContainer.append('div').attr('class', 'pod-content');

        if (podMembers.length > 0) {
            const levelSortOrder = ['Director', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Senior Analyst', 'Analyst'];
            podMembers.sort((a, b) => {
                const levelA = levelSortOrder.indexOf(a.level);
                const levelB = levelSortOrder.indexOf(b.level);
                if (levelA === -1) return 1;
                if (levelB === -1) return -1;
                return levelA - levelB;
            });

            const table = podContent.append('table').attr('class', 'pod-table');
            const thead = table.append('thead');
            const tbody = table.append('tbody');

            const headerRow = thead.append('tr');
            headerRow.append('th').append('input')
                .attr('type', 'checkbox')
                .on('click', function() {
                    const isChecked = d3.select(this).property('checked');
                    podContainer.selectAll('.pod-member-checkbox').property('checked', isChecked).dispatch('change');
                });
            
            headerRow.selectAll('th.col-header')
                .data(['Level', 'Name', 'Talent Group', 'Offering', 'Location', 'Actions'])
                .enter()
                .append('th')
                .attr('class', 'col-header')
                .text(d => d);

            podMembers.forEach(member => {
                const row = tbody.append('tr');
                
                row.append('td').append('input')
                   .attr('type', 'checkbox')
                   .attr('class', 'pod-member-checkbox')
                   .datum(member) // Attach data to checkbox
                   .on('change', function() {
                        const checkedCount = podContainer.selectAll('.pod-member-checkbox:checked').size();
                        bulkMoveButton.style('display', checkedCount > 0 ? 'inline-block' : 'none');
                   });

                const partnerLocation = partner['Location  Name'];
                const memberLocation = member['Location  Name'];
                if (partnerLocation && memberLocation && partnerLocation !== memberLocation) {
                    row.attr('class', 'pod-member-different-location');
                }

                row.append('td').text(member.level);
                
                let nameDisplay = member.name;
                if (member.isMoved) {
                    nameDisplay += ` <span class="move-action-icon" title="This employee has been temporarily moved.">🔄</span>`;
                }
                if (member.coaching_tree_partner_id && member.partner_relationship_id && member.coaching_tree_partner_id !== member.partner_relationship_id) {
                    nameDisplay += ` <span class="coaching-tree-mismatch" title="Coaching tree partner is different from pod partner.">🌳</span>`;
                }
                const nameCell = row.append('td').html(nameDisplay).style('white-space', 'nowrap');
                
                row.append('td').text(member.talent_group || 'N/A');
                
                const offeringCell = row.append('td').text(member['Operating Unit Name'] || 'N/A');
                const partnerOffering = partner['Operating Unit Name'];
                const memberOffering = member['Operating Unit Name'];
                if (partnerOffering && memberOffering && partnerOffering !== memberOffering) {
                    offeringCell.attr('class', 'pod-member-different-offering');
                }

                row.append('td').text(memberLocation || 'N/A');
                
                const actionsCell = row.append('td');

                actionsCell.append('button').text('Move').on('click', (event) => {
                    event.stopPropagation();
                    showMovePodModal([member]); // Pass as an array for consistency
                });

                if (member.isMoved) {
                    actionsCell.append('button')
                        .text('Revert')
                        .style('margin-left', '5px')
                        .on('click', (event) => {
                            event.stopPropagation();
                            revertPodMove(member.id);
                        });
                }

                nameCell.on("mouseover", function(event) {
                        showTooltip(event, member);
                    })
                    .on("mouseout", hideTooltip);
            });
        }
    });

    if (errors.length > 0) {
        const errorContainer = container.append('div').attr('class', 'pod-container');
        const errorHeader = errorContainer.append('div')
            .attr('class', 'pod-header')
            .on('click', function() {
                const content = d3.select(this.parentNode).select('.pod-content');
                const isHidden = content.style('display') === 'none';
                content.style('display', isHidden ? 'block' : 'none');
            });

        errorHeader.append('span')
            .text(`Pod Relationship Errors in ${currentSelectedOU} (${errors.length})`);

        const bulkMoveButton = errorHeader.append('button')
            .attr('class', 'bulk-move-button')
            .text('Bulk Move Selected')
            .on('click', function(event) {
                event.stopPropagation();
                const selectedEmployees = [];
                errorContainer.selectAll('.pod-member-checkbox:checked').each(function(d) {
                    selectedEmployees.push(d);
                });
                if (selectedEmployees.length > 0) {
                    showMovePodModal(selectedEmployees);
                } else {
                    alert("Please select at least one employee to move.");
                }
            });

        const errorContent = errorContainer.append('div').attr('class', 'pod-content');
        const errorTable = errorContent.append('table').attr('class', 'pod-table');
        
        const errorThead = errorTable.append('thead').append('tr');
        errorThead.append('th').append('input')
            .attr('type', 'checkbox')
            .on('click', function() {
                const isChecked = d3.select(this).property('checked');
                errorContainer.selectAll('.pod-member-checkbox').property('checked', isChecked).dispatch('change');
            });

        errorThead.selectAll('th.col-header')
            .data(['Name', 'Level', 'Talent Group', 'Offering', 'Location', 'Reason', 'Actions'])
            .enter().append('th').attr('class', 'col-header').text(d => d);

        const errorTbody = errorTable.append('tbody');
        errors.forEach(emp => {
            let reason = 'Unknown';
            if (emp.pod_relationship_status === 'error_invalid_id') {
                reason = `Invalid Partner (${emp.partner_relationship_name || emp.partner_relationship_id || 'N/A'})`;
            } else if (emp.pod_relationship_status === 'warning_different_offering') {
                const podPartner = findNodeById(currentGlobalPartnerTrees, emp.partner_relationship_id);
                const partnerName = podPartner ? podPartner.name : (emp.partner_relationship_name || 'Unknown');
                const partnerOffering = podPartner ? podPartner['Operating Unit Name'] : 'Unknown';
                reason = `Partner (${partnerName}) is in different Offering (${partnerOffering})`;
            }
            const row = errorTbody.append('tr');

            row.append('td').append('input')
                .attr('type', 'checkbox')
                .attr('class', 'pod-member-checkbox')
                .datum(emp)
                .on('change', function() {
                    const checkedCount = errorContainer.selectAll('.pod-member-checkbox:checked').size();
                    bulkMoveButton.style('display', checkedCount > 0 ? 'inline-block' : 'none');
                });

            row.append('td').text(emp.name);
            row.append('td').text(emp.level);
            row.append('td').text(emp.talent_group || 'N/A');
            row.append('td').text(emp['Operating Unit Name'] || 'N/A');
            row.append('td').text(emp['Location  Name'] || 'N/A');
            row.append('td').text(reason);
            row.append('td').append('button').text('Move').on('click', (event) => {
                event.stopPropagation();
                showMovePodModal([emp]);
            });
        });
    }
}

function populatePartnerSelector(partnerTreeData) {
    const selector = d3.select("#tree-selector");
    selector.selectAll("option").remove();
    
    if (!partnerTreeData || partnerTreeData.length === 0) {
        const message = `No Partners found for ${currentSelectedOU}.`;
        selector.append("option").text(message);
        return;
    }

    selector.selectAll("option") 
        .data(partnerTreeData)
        .enter()
        .append("option")
        .attr("value", d => d.id)
        .text(d => {
            const name = d.name || d.id;
            const coacheeCount = typeof d.indirect_coachee_count !== 'undefined' ? d.indirect_coachee_count : 'N/A';
            return `${name} (Pod Size: ${coacheeCount})`;
        });
}

function showTooltip(event, d) {
    const allNodes = [...flattenTree(currentGlobalPartnerTrees), ...currentOrphanedReport];
    const coach = d.coach_id ? allNodes.find(n => n.id === d.coach_id) : null;
    const coachName = coach ? coach.name : 'N/A';
    const coachingTreePartner = d.coaching_tree_partner_id ? allNodes.find(n => n.id === d.coaching_tree_partner_id) : null;
    const coachingTreePartnerName = coachingTreePartner ? coachingTreePartner.name : 'N/A';

    let tooltipText = `Name: ${d.name || 'N/A'}
Level: ${d.level || 'N/A'}
Location: ${d['Location  Name'] || 'N/A'}
Offering: ${d['Operating Unit Name'] || 'N/A'}
Talent Group: ${d.talent_group || 'N/A'}
Coach: ${coachName}
Coaching Tree: ${coachingTreePartnerName}
Direct Reports: ${d.direct_coachee_count !== undefined ? d.direct_coachee_count : 'N/A'}`;

    tooltip.transition().duration(200).style("opacity", .9);
    tooltip.html(tooltipText)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 28) + "px");
}

function hideTooltip() {
    tooltip.transition().duration(500).style("opacity", 0);
}

function showMovePodModal(employeesToMove) {
    currentEmployeeToMovePod = employeesToMove; // This now holds an array

    if (employeesToMove.length === 1) {
        movePodModalTitle.textContent = `Move Pod Member: ${employeesToMove[0].name}`;
        movePodMemberInfo.textContent = `ID: ${employeesToMove[0].id}, Current Pod: ${employeesToMove[0].partner_relationship_name || 'N/A'}`;
    } else {
        movePodModalTitle.textContent = `Bulk Move ${employeesToMove.length} Employees`;
        movePodMemberInfo.textContent = `Moving multiple employees to a new pod.`;
    }
    
    const firstEmployee = employeesToMove[0];
    const allEmployeesForPods = getUniqueEmployees();
    const ouPartners = currentGlobalPartnerTrees.filter(p => p['Operating Unit Name'] === currentSelectedOU);
    const ouPartnerIds = new Set(ouPartners.map(p => p.id));
    const unassignedList = allEmployeesForPods.filter(emp => {
        const podId = emp.partner_relationship_id;
        return emp['Operating Unit Name'] === currentSelectedOU && emp.level !== PARTNER_LEVEL_VALUE && (podId ? !ouPartnerIds.has(podId) || !emp.is_pod_relationship_valid : true);
    });
    const employeeLocation = firstEmployee['Location  Name'];

    // When moving from the "All Employees" or "Partner Pods" view, the target OU should always be the one selected in the main filter.
    const targetOU = currentSelectedOU;
    
    const eligiblePartners = currentGlobalPartnerTrees.filter(p =>
        p.level === PARTNER_LEVEL_VALUE &&
        p['Operating Unit Name'] === targetOU
    );

    // Sort partners: same location first, then by name
    eligiblePartners.sort((a, b) => {
        const aSameLoc = a['Location  Name'] === employeeLocation;
        const bSameLoc = b['Location  Name'] === employeeLocation;
        if (aSameLoc && !bSameLoc) return -1;
        if (!aSameLoc && bSameLoc) return 1;
        return a.name.localeCompare(b.name);
    });

    newPodPartnerSelector.innerHTML = '<option value="">Select New Partner...</option>';
    const podSizes = getPodSizes(allEmployeesForPods);

    eligiblePartners.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        const podSize = podSizes[p.id] || 0;
        let text = `${p.name} (${p['Location  Name']}) - Pod Size: ${podSize}`;
        if (p['Location  Name'] !== employeeLocation) {
            text += ' - Different Location';
        }
        option.textContent = text;
        newPodPartnerSelector.appendChild(option);
    });

    movePodMemberModal.style.display = "block";
}

function confirmPodMove() {
    const newPartnerId = newPodPartnerSelector.value;
    if (!currentEmployeeToMovePod || !newPartnerId) {
        alert("Please select an employee and a new partner.");
        return;
    }

    const newPartnerNode = findNodeById(currentGlobalPartnerTrees, newPartnerId);
    if (!newPartnerNode) {
        alert("Error: Could not find the new Pod Partner.");
        return;
    }

    const allEmployeesFromSource = getUniqueEmployees();

    currentEmployeeToMovePod.forEach(employeeToMove => {
        // If the employee is already in the log, we just update their final destination.
        if (podChangeLog[employeeToMove.id]) {
            podChangeLog[employeeToMove.id].new_partner_id = newPartnerId;
            podChangeLog[employeeToMove.id].new_partner_name = newPartnerNode.name;
            podChangeLog[employeeToMove.id].timestamp = new Date().toISOString();
        } else {
            // If it's a new move, we need to find their ORIGINAL partner from the source data.
            const originalEmployeeState = allEmployeesFromSource.find(e => e.id === employeeToMove.id);
            const originalPartnerId = originalEmployeeState ? originalEmployeeState.partner_relationship_id : null;
            const originalPartner = originalPartnerId ? findNodeById(currentGlobalPartnerTrees, originalPartnerId) : null;
            const originalPartnerName = originalPartner ? originalPartner.name : "N/A";

            podChangeLog[employeeToMove.id] = {
                moved_employee_id: employeeToMove.id,
                moved_employee_name: employeeToMove.name,
                original_partner_id: originalPartnerId,
                original_partner_name: originalPartnerName,
                new_partner_id: newPartnerId,
                new_partner_name: newPartnerNode.name,
                timestamp: new Date().toISOString()
            };
        }
        
        // Apply the change visually for immediate feedback
        employeeToMove.partner_relationship_id = newPartnerId;
        employeeToMove.partner_relationship_name = newPartnerNode.name;
        employeeToMove.is_pod_relationship_valid = true;
        employeeToMove.pod_relationship_status = 'valid';
        employeeToMove.isMoved = true;
    });

    savePodChangeLog();
    renderPodChangeLogTable();
    const allEmployees = getUniqueEmployees(); // Re-fetch to ensure current state
    renderPartnerPods(allEmployees, currentGlobalPartnerTrees);
    renderAllEmployeesList(allEmployees, currentGlobalPartnerTrees);

    movePodMemberModal.style.display = "none";
    currentEmployeeToMovePod = null;
}

function renderPodChangeLogTable() {
    const tableBody = d3.select("#pod-moves-log-table tbody");
    tableBody.selectAll("*").remove();

    const logEntries = Object.values(podChangeLog);

    if (logEntries.length === 0) {
        tableBody.append('tr').append('td')
            .attr('colspan', 5) // Now 5 columns
            .style('text-align', 'center')
            .text('No pod moves recorded.');
        return;
    }

    const rows = tableBody.selectAll("tr")
        .data(logEntries)
        .enter()
        .append("tr");

    rows.append("td").text(d => d.moved_employee_name);
    rows.append("td").text(d => d.original_partner_name);
    rows.append("td").text(d => d.new_partner_name);
    rows.append("td").text(d => new Date(d.timestamp).toLocaleString());
    rows.append("td").append('button').text('Revert').on('click', (event, d) => {
        event.stopPropagation();
        revertPodMove(d.moved_employee_id);
    });
}

function clearPodMoves() {
    if (confirm("Are you sure you want to clear all temporary pod moves?")) {
        podChangeLog = {};
        savePodChangeLog();
        window.location.reload();
    }
}

function revertPodMove(employeeId) {
    if (podChangeLog[employeeId]) {
        delete podChangeLog[employeeId];
        savePodChangeLog();
        // A full reload is the simplest way to ensure all state is correct
        location.reload();
    }
}

function showMoveEmployeeModal(employeeD3Node) {
    console.log("Attempting to show move modal for:", employeeD3Node.data.name);
    currentEmployeeToMoveD3Node = employeeD3Node; 
    moveModalTitle.textContent = `Move Employee: ${employeeD3Node.data.name}`;
    moveEmployeeInfo.textContent = `ID: ${employeeD3Node.data.id}, Current OU: ${employeeD3Node.data['Operating Unit Name']}, Current Location: ${employeeD3Node.data['Location  Name']}`;
    populateNewPartnerSelector(employeeD3Node.data); 
    moveEmployeeModal.style.display = "block";
}

function populateNewPartnerSelector(employeeData) {
    console.log("Populating partner selector for employee:", employeeData.name);
    newPartnerSelector.innerHTML = '<option value="">Select New Partner...</option>'; 

    const employeeOU = employeeData['Operating Unit Name'];
    const employeeLocation = employeeData['Location  Name'];

    const eligiblePartners = currentGlobalPartnerTrees.filter(partnerNode => {
        return partnerNode.level === PARTNER_LEVEL_VALUE && 
               partnerNode.id !== employeeData.coach_id && 
               partnerNode.id !== employeeData.id && 
               partnerNode['Operating Unit Name'] === employeeOU &&
               partnerNode['Location  Name'] === employeeLocation;
    });

    eligiblePartners.forEach(partner => {
        const option = document.createElement('option');
        option.value = partner.id;
        
        const currentPartnerState = findNodeById(currentGlobalPartnerTrees, partner.id);
        const directCoachees = currentPartnerState ? (currentPartnerState.children ? currentPartnerState.children.length : 0) : (partner.children ? partner.children.length : 0);
        const indirectCoachees = currentPartnerState ? currentPartnerState.indirect_coachee_count : partner.indirect_coachee_count;

        option.textContent = `${partner.name} (Direct: ${directCoachees !== undefined ? directCoachees : 'N/A'}, Pod: ${indirectCoachees !== undefined ? indirectCoachees : 'N/A'})`;
        newPartnerSelector.appendChild(option);
    });
}

function renderChangeLogTable() {
    if (!tempMovesLogTableBody) {
        console.error("tempMovesLogTableBody is not initialized.");
        return;
    }
    tempMovesLogTableBody.innerHTML = ''; 

    if (changeLog.length === 0) {
        const row = tempMovesLogTableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5; 
        cell.textContent = 'No temporary moves recorded.';
        cell.style.textAlign = 'center';
        return;
    }

    const sortedLog = [...changeLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sortedLog.forEach(logEntry => {
        const row = tempMovesLogTableBody.insertRow();
        row.insertCell().textContent = logEntry.moved_employee_name || 'N/A';
        row.insertCell().textContent = logEntry.moved_employee_id;
        row.insertCell().textContent = logEntry.original_coach_name || 'N/A';
        row.insertCell().textContent = logEntry.new_coach_name || 'N/A';
        row.insertCell().textContent = new Date(logEntry.timestamp).toLocaleString();
    });
}

function clearTemporaryMoves() {
    if (confirm("Are you sure you want to clear all temporary moves? This cannot be undone and will revert the view to the original data from forest.json.")) {
        changeLog = [];
        saveChangeLog();
        alert("Temporary moves cleared. The page will now reload to reflect the original data.");
        window.location.reload();
    }
}

function refreshPartnerSelectorOptions() {
    const selector = d3.select("#tree-selector");
    selector.selectAll("option").each(function() {
        const optionElement = d3.select(this);
        const partnerId = optionElement.attr("value");
        if (partnerId) {
            const partnerData = findNodeById(currentGlobalPartnerTrees, partnerId);
            if (partnerData) {
                const name = partnerData.name || partnerData.id;
                // Ensure indirect_coachee_count is taken from the live data
                const indirectCoacheeCount = typeof partnerData.indirect_coachee_count !== 'undefined' ? partnerData.indirect_coachee_count : 'N/A';
                optionElement.text(`${name} (Pod Size: ${indirectCoacheeCount})`);
            }
        }
    });
    console.log("Refreshed partner selector options.");
}
function downloadCSV(data, filename) {
    if (!data || data.length === 0) {
        alert("No data to download.");
        return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','), 
        ...data.map(row => 
            headers.map(fieldName => 
                JSON.stringify(row[fieldName], (key, value) => value === null ? '' : value)
            ).join(',')
        )
    ];

    const csvString = csvRows.join('\r\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");

    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
function populateFilter(selectorId, values, defaultOptionText) {
    const selector = d3.select(selectorId);
    selector.selectAll("option").remove();
    selector.append("option").attr("value", "all").text(defaultOptionText);
    const sortedValues = Array.from(values).sort();
    sortedValues.forEach(value => {
        selector.append("option").attr("value", value).text(value);
    });
}
function downloadAllEmployeesCSV() {
    const allEmployees = getUniqueEmployees(); 
    const allPartners = currentGlobalPartnerTrees.filter(p => p.level === PARTNER_LEVEL_VALUE);

    const locationFilter = d3.select("#location-filter").property("value");
    const talentGroupFilter = d3.select("#talent-group-filter").property("value");

    let filteredEmployees = allEmployees.filter(emp => emp['Operating Unit Name'] === currentSelectedOU);

    if (locationFilter && locationFilter !== 'all') {
        filteredEmployees = filteredEmployees.filter(emp => emp['Location  Name'] === locationFilter);
    }
    if (talentGroupFilter && talentGroupFilter !== 'all') {
        filteredEmployees = filteredEmployees.filter(emp => emp.talent_group === talentGroupFilter);
    }

    const headers = [
        "Employee ID", "Name", "Level", "Location", "Talent Group", "Offering",
        "Coach ID", "Coach Name",
        "Coaching Tree Lead ID", "Coaching Tree Lead Name",
        "Pod Lead ID", "Pod Lead Name"
    ];

    const data = filteredEmployees.map(emp => {
        const coach = allEmployees.find(e => e.id === emp.coach_id);
        const coachingTreeLead = allPartners.find(p => p.id === emp.coaching_tree_partner_id);
        
        const podMove = podChangeLog[emp.id];
        let finalPodPartnerId;
        if (podMove) {
            finalPodPartnerId = podMove.new_partner_id;
        } else {
            finalPodPartnerId = emp.partner_relationship_id;
        }
        const finalPodPartner = allPartners.find(p => p.id === finalPodPartnerId);

        return [
            emp.id,
            emp.name,
            emp.level,
            emp['Location  Name'] || 'N/A',
            emp.talent_group || 'N/A',
            emp['Operating Unit Name'] || 'N/A',
            emp.coach_id || 'N/A',
            coach ? coach.name : 'N/A',
            emp.coaching_tree_partner_id || 'N/A',
            coachingTreeLead ? coachingTreeLead.name : 'N/A',
            finalPodPartnerId || 'N/A',
            finalPodPartner ? finalPodPartner.name : 'N/A'
        ];
    });

    const csvData = [headers, ...data];
    const ouName = currentSelectedOU.replace(/[^a-z0-9]/gi, '_');
    downloadCSV(csvData, `all_employees_${ouName}.csv`);
}

let allEmployeesSortKey = 'name';
let allEmployeesSortAsc = true;

function renderAllEmployeesList(allEmployees, allPartners) {
    const container = d3.select("#all-employees-container");
    container.selectAll("*").remove();

    if (!currentSelectedOU) {
        container.html('<p>Please select an Operating Unit to view employees.</p>');
        return;
    }

    const locationFilter = d3.select("#location-filter").property("value");
    const talentGroupFilter = d3.select("#talent-group-filter").property("value");

    let filteredEmployees = allEmployees.filter(emp => emp['Operating Unit Name'] === currentSelectedOU);

    if (locationFilter !== 'all') {
        filteredEmployees = filteredEmployees.filter(emp => emp['Location  Name'] === locationFilter);
    }
    if (talentGroupFilter !== 'all') {
        filteredEmployees = filteredEmployees.filter(emp => emp.talent_group === talentGroupFilter);
    }

    // Sorting logic
    filteredEmployees.sort((a, b) => {
        let valA = a[allEmployeesSortKey] || '';
        let valB = b[allEmployeesSortKey] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return allEmployeesSortAsc ? -1 : 1;
        if (valA > valB) return allEmployeesSortAsc ? 1 : -1;
        return 0;
    });

    const bulkMoveButton = container.append('button')
        .attr('class', 'bulk-move-button')
        .text('Bulk Move Selected')
        .style('display', 'none') // Initially hidden
        .on('click', function(event) {
            event.stopPropagation();
            const selectedEmployees = [];
            container.selectAll('.employee-checkbox:checked').each(function(d) {
                selectedEmployees.push(d);
            });
            if (selectedEmployees.length > 0) {
                showMovePodModal(selectedEmployees);
            } else {
                alert("Please select at least one employee to move.");
            }
        });

    if (filteredEmployees.length === 0) {
        container.append("p").text("No employees match the current filter criteria.");
        return;
    }

    const table = container.append('table').attr('class', 'pod-table');
    const thead = table.append('thead');
    const tbody = table.append('tbody');

    const headerRow = thead.append('tr');
    headerRow.append('th').append('input')
        .attr('type', 'checkbox')
        .on('click', function() {
            const isChecked = d3.select(this).property('checked');
            container.selectAll('.employee-checkbox').property('checked', isChecked).dispatch('change');
        });

    const columns = [
        { key: 'name', label: 'Name' },
        { key: 'level', label: 'Level' },
        { key: 'talent_group', label: 'Talent Group' },
        { key: 'Location  Name', label: 'Location' },
        { key: 'partner_relationship_name', label: 'Pod Lead Partner' },
        { key: 'coaching_tree_partner_name', label: 'Coaching Tree Partner' }
    ];

    headerRow.selectAll('th.col-header')
        .data(columns)
        .enter()
        .append('th')
        .attr('class', 'col-header')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
            if (allEmployeesSortKey === d.key) {
                allEmployeesSortAsc = !allEmployeesSortAsc;
            } else {
                allEmployeesSortKey = d.key;
                allEmployeesSortAsc = true;
            }
            renderAllEmployeesList(allEmployees, allPartners);
        })
        .html(d => {
            let sortIndicator = '';
            if (d.key === allEmployeesSortKey) {
                sortIndicator = allEmployeesSortAsc ? ' &#9650;' : ' &#9660;';
            }
            return d.label + sortIndicator;
        });
    
    headerRow.append('th').text('Actions'); // Actions header

    const partnerMap = new Map(allPartners.map(p => [p.id, p.name]));

    filteredEmployees.forEach(member => {
        const row = tbody.append('tr');

        row.append('td').append('input')
           .attr('type', 'checkbox')
           .attr('class', 'employee-checkbox')
           .datum(member)
           .on('change', function() {
                const checkedCount = container.selectAll('.employee-checkbox:checked').size();
                bulkMoveButton.style('display', checkedCount > 0 ? 'inline-block' : 'none');
           });

        columns.forEach(col => {
            row.append('td').text(member[col.key] || 'N/A');
        });

        row.append('td').append('button').text('Move').on('click', (event) => {
            event.stopPropagation();
            showMovePodModal([member]);
        });
    });
}
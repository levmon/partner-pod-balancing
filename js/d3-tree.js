function loadTree(treeData) {
    setupSvg(); 
    i = 0; 

    currentRoot = d3.hierarchy(treeData, d => d.children);
    currentRootPartnerLocation = currentRoot.data['Location  Name']; 

    const svgNode = svg.node(); 
    const effectiveHeight = svgNode.clientHeight > 0 ? svgNode.clientHeight : 600; 
    currentRoot.x0 = effectiveHeight / 2; 
    currentRoot.y0 = 0;

    update(currentRoot); 
}

function update(source) {
    const svgNode = svg.node();
    const currentSvgWidth = svgNode.clientWidth;
    const currentSvgHeight = svgNode.clientHeight;

    const availableWidth = currentSvgWidth - margin.left - margin.right;
    const availableHeight = currentSvgHeight - margin.top - margin.bottom;
    
    const treeHorizontalSpread = calculateDynamicWidth(currentRoot);
    
    treeLayout = d3.tree()
        .size([availableHeight > 0 ? availableHeight : 600, treeHorizontalSpread]) 
        .separation((a, b) => a.parent == b.parent ? 1.5 : 2); 
    const treeData = treeLayout(currentRoot);

    const nodes = treeData.descendants();
    const links = treeData.descendants().slice(1);

    const nodeDepthSpacing = 250; 
    nodes.forEach(d => { d.y = d.depth * nodeDepthSpacing;});

    const node = g.selectAll("g.node")
        .data(nodes, d => d.id || (d.id = ++i));

    const nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${source.y0},${source.x0})`)
        .on("click", (event, d) => { 
            customContextMenu.style.display = 'none'; 
            contextMenuTargetNode = null;
            if (d.children || d._children) { 
                toggle(d);
                update(d);
            }
        })
        .on("contextmenu", function(event, d) { 
            event.preventDefault();
            customContextMenu.style.display = 'none'; 
            contextMenuTargetNode = null;

            if (d.data.level !== PARTNER_LEVEL_VALUE) {
                contextMenuTargetNode = d; 
                customContextMenu.style.left = event.pageX + 'px';
                customContextMenu.style.top = event.pageY + 'px';
                customContextMenu.style.display = 'block';
            }
        })
        .on("mouseover", function(event, d) {
            showTooltip(event, d.data);
        })
        .on("mouseout", hideTooltip);

    nodeEnter.append("circle")
        .attr("r", 1e-6)
        .style("fill", d => {
            const nodeOU = d.data['Operating Unit Name'];
            const rootOU = currentRoot && currentRoot.data ? currentRoot.data['Operating Unit Name'] : null;
            if (rootOU && nodeOU && nodeOU !== rootOU) {
                return config.colors.nodeFillDifferentOU; 
            }
            return config.colors.nodeFillSameOU; 
        })
        .style("stroke", d => {
            const isSameLocation = currentRootPartnerLocation && d.data['Location  Name'] === currentRootPartnerLocation;
            if (currentRootPartnerLocation && !isSameLocation) {
                return config.colors.nodeStrokeDifferentLocation;
            }
            return config.colors.nodeStrokeSameLocation;
        })
        .style("stroke-width", "3px");

    nodeEnter.append("text")
        .attr("dy", ".35em")
        .attr("x", d => d.children || d._children ? -13 : 13)
        .attr("text-anchor", d => d.children || d._children ? "end" : "start")
        .html(d => {
            const name = d.data.name || d.data.id || "Unknown";
            const level = d.data.level || "N/A";
            const location = d.data['Location  Name'] || "N/A";
            const isPartner = d.data.level === PARTNER_LEVEL_VALUE;
            const indirectCoachees = d.data.indirect_coachee_count;
            const xPos = d.children || d._children ? -13 : 13;
            const defaultFillStyle = "black"; 

            let nameStyle = `fill:${defaultFillStyle}`; 
            if (d.data.hasOwnProperty('direct_coachee_count') && d.data.hasOwnProperty('FTE')) {
                const directCoachees = parseInt(d.data.direct_coachee_count, 10);
                const fteValue = parseFloat(d.data.FTE);
                if (!isNaN(directCoachees) && !isNaN(fteValue) && fteValue > 0) { 
                    if (directCoachees > (5 * fteValue)) {
                        nameStyle = "font-weight: bold; fill: red;";
                    }
                }
            }
            
            let movedIcon = "";
            if (changeLog.some(log => log.moved_employee_id === d.data.id)) {
                movedIcon = ' <tspan class="move-action-icon">↔️</tspan>';
            }

            let htmlString = `<tspan class="node-text-name" style="${nameStyle}" x="${xPos}" dy="0em">${name}${movedIcon}</tspan>` +
                             `<tspan class="node-text-details" style="fill:${defaultFillStyle}" x="${xPos}" dy="1.2em">${level}</tspan>` +
                             `<tspan class="node-text-details" style="fill:${defaultFillStyle}" x="${xPos}" dy="1.2em">${location}</tspan>`;
            
            if (isPartner && typeof indirectCoachees !== 'undefined') {
                htmlString += `<tspan class="node-text-details" style="fill:${defaultFillStyle}" x="${xPos}" dy="1.2em">Pod Size: ${indirectCoachees}</tspan>`;
            }
            return htmlString;
        });

    const nodeUpdate = nodeEnter.merge(node);

    nodeUpdate.transition()
        .duration(duration)
        .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select("circle")
        .attr("r", 10)
        .style("fill", d => { 
            const nodeOU = d.data['Operating Unit Name'];
            const rootOU = currentRoot && currentRoot.data ? currentRoot.data['Operating Unit Name'] : null;
            if (rootOU && nodeOU && nodeOU !== rootOU) {
                return config.colors.nodeFillDifferentOU; 
            }
            return config.colors.nodeFillSameOU; 
        })
        .style("stroke", d => { 
            const isSameLocation = currentRootPartnerLocation && d.data['Location  Name'] === currentRootPartnerLocation;
            if (currentRootPartnerLocation && !isSameLocation) {
                return config.colors.nodeStrokeDifferentLocation;
            }
            return config.colors.nodeStrokeSameLocation;
        })
        .style("stroke-width", "3px")
        .attr("cursor", "pointer");

    nodeUpdate.select("text").html(d => { 
            const name = d.data.name || d.data.id || "Unknown";
            const level = d.data.level || "N/A";
            const location = d.data['Location  Name'] || "N/A";
            const isPartner = d.data.level === PARTNER_LEVEL_VALUE;
            const indirectCoachees = d.data.indirect_coachee_count;
            const xPos = d.children || d._children ? -13 : 13;
            const defaultFillStyle = "black"; 

            let nameStyle = `fill:${defaultFillStyle}`; 
            if (d.data.hasOwnProperty('direct_coachee_count') && d.data.hasOwnProperty('FTE')) {
                const directCoachees = parseInt(d.data.direct_coachee_count, 10);
                const fteValue = parseFloat(d.data.FTE);
                 if (!isNaN(directCoachees) && !isNaN(fteValue) && fteValue > 0) { 
                    if (directCoachees > (5 * fteValue)) {
                        nameStyle = "font-weight: bold; fill: red;";
                    }
                }
            }

            let movedIcon = "";
            if (changeLog.some(log => log.moved_employee_id === d.data.id)) {
                movedIcon = ' <tspan class="move-action-icon">↔️</tspan>';
            }

            let htmlString = `<tspan class="node-text-name" style="${nameStyle}" x="${xPos}" dy="0em">${name}${movedIcon}</tspan>` +
                             `<tspan class="node-text-details" style="fill:${defaultFillStyle}" x="${xPos}" dy="1.2em">${level}</tspan>` +
                             `<tspan class="node-text-details" style="fill:${defaultFillStyle}" x="${xPos}" dy="1.2em">${location}</tspan>`;
            
            if (isPartner && typeof indirectCoachees !== 'undefined') {
                htmlString += `<tspan class="node-text-details" style="fill:${defaultFillStyle}" x="${xPos}" dy="1.2em">Pod Size: ${indirectCoachees}</tspan>`;
            }
            return htmlString;
    });

    const nodeExit = node.exit().transition()
        .duration(duration)
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .remove();

    nodeExit.select("circle").attr("r", 1e-6);
    nodeExit.select("text").style("fill-opacity", 1e-6);

    const link = g.selectAll("path.link")
        .data(links, d => d.id);

    const linkEnter = link.enter().insert("path", "g")
        .attr("class", "link")
        .style("stroke", config.colors.link)
        .attr("d", d => {
            const o = {x: source.x0, y: source.y0};
            return diagonal(o, o);
        });

    const linkUpdate = linkEnter.merge(link);

    linkUpdate.transition()
        .duration(duration)
        .style("stroke", config.colors.link)
        .attr("d", d => diagonal(d, d.parent));

    link.exit().transition()
        .duration(duration)
        .attr("d", d => {
            const o = {x: source.x, y: source.y};
            return diagonal(o, o);
        })
        .remove();

    nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

function toggle(d) {
    if (d.children) { 
        d._children = d.children; 
        d.children = null;       
    } else { 
        d.children = d.children || d._children; 
        d._children = null;      
    }
}

function collapse(d) { 
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse); 
        d.children = null;
    }
}

function diagonal(s, d) {
    const path = `M ${s.y} ${s.x}
                C ${(s.y + d.y) / 2} ${s.x},
                  ${(s.y + d.y) / 2} ${d.x},
                  ${d.y} ${d.x}`;
    return path;
}
function calculateDynamicWidth(root) {
    if (!root) { 
         const svgNode = svg.node(); 
         if (svgNode && svgNode.clientWidth > 0) return svgNode.clientWidth - margin.left - margin.right;
         return 1000; 
    }
    let maxD = 0;
    root.each(d => { if (d.depth > maxD) maxD = d.depth; });
    return (maxD + 1) * 280; 
}
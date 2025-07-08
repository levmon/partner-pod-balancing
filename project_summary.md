# Project Summary: Partner Pod Balancing

This project is a two-part system designed for visualizing and analyzing organizational hierarchies from an employee spreadsheet. It consists of:

1.  A **Python script (`build_forest.py`)** that acts as a data processing and validation engine.
2.  A **web application (`index.html`)** that provides an interactive, visual interface to the processed data.

The system models two distinct types of employee relationships: a **Coaching Hierarchy** and a **Partner Pod** relationship.

---

## 1. Data Processing and Validation (`build_forest.py`)

The Python script is the foundation of the project. It reads an Excel file, cleans and validates the data, and then transforms it into a structured `forest.json` file that the web application can use.

**Key Functions:**

*   **Data Ingestion:** It loads data from `Employee Input Data.xlsx` using the `pandas` library. The `COLUMN_MAPPING` dictionary is crucial, as it allows the script to work with consistent internal names (`employee_id`, `coach_id`, etc.) even if the source Excel column names change. The `INCLUDED_DATA_COLUMNS` list provides flexibility, allowing easy configuration of which data fields from the Excel file are exported to the final JSON.
*   **Data Validation:** This is a major feature of the script. Before building any hierarchies, it performs numerous checks inside the `validate_data` function:
    *   **Partner Identification:** It identifies "Partners" based on their "Level" (where `level` is 'Partner'). Partners are the top of the coaching hierarchies. It also separates "Retired Partners" from the active dataset to ensure they are not included in validation logic.
    *   **Coaching Chain Integrity:** It ensures every non-partner has a valid coach and that the coach exists in the employee list. Employees with invalid coaches are flagged.
    *   **Orphan Analysis:** It identifies "orphaned" employees who cannot be traced up to a Partner. The `find_broken_chain_root_cause` function is particularly insightful; it analyzes *why* an employee is an orphan (e.g., "Coaching chain terminates at 'X', who is not a Partner" or "coach 'Y' is a Retired Partner").
    *   **Cycle Detection:** It explicitly checks for and flags coaching cycles (e.g., A coaches B, and B coaches A), which would break the tree structure.
    *   **Partner Pod Validation:** It validates the `partner_relationship_id` to ensure it points to a valid, active Partner.
*   **Hierarchy Construction:**
    *   **Coaching Trees:** After validation, the script builds the coaching hierarchies by linking employees to their coaches. It calculates the total number of direct and indirect coachees for each person, which is used in the visualization.
    *   **Root Partner Stamping:** Each employee node in a valid tree is stamped with a `coaching_tree_partner_id`. This allows the web application to easily identify which tree an employee belongs to for cross-referencing against their pod assignment.
    *   **JSON Export:** The final output is a single `forest.json` file containing two main sections:
        *   `all_partner_trees`: A list of all partners, with their entire coaching hierarchy nested inside as "children".
        *   `all_orphaned_employees`: A flat list of all employees who could not be placed in a tree, including the reason why.

---

## 2. Interactive Visualization (`index.html`)

The web application consists of a main `index.html` file and a `js` directory containing the application's JavaScript logic. The application uses the **D3.js library** to create rich, interactive visualizations from the `forest.json` data. The JavaScript is organized into the following files:

*   **`js/main.js`**: The entry point for the application, responsible for initializing the application and setting up event listeners.
*   **`js/data.js`**: Handles all data-related operations, including loading `forest.json`, managing change logs, and applying logged changes.
*   **`js/ui.js`**: Contains all functions for rendering and interacting with UI components, such as tables, modals, and selectors.
*   **`js/d3-tree.js`**: Encapsulates all logic specific to the D3.js coaching tree visualization.

**Key Features:**

*   **Top-Level Filtering:** The entire application is driven by a top-level **Operating Unit (OU) selector**. This allows users to focus the entire dashboard—including coaching trees, orphan reports, and pod views—on a specific business area.

*   **Two-Tiered Navigation:** To provide a clearer user experience, the application is split into two main views, each with its own set of tabs:
    *   **Coaching Forest View:** This is the primary area for analyzing the hierarchical coaching structure. It contains the following tabs:
        *   **Partner Trees:** The main interactive, collapsible tree diagrams for each Partner.
        *   **Orphaned:** A report listing all employees who cannot be traced to a valid Partner.
        *   **Coaching Moves Log:** A log of all temporary "what-if" changes made to the coaching trees.
    *   **Partner Pods View:** This area focuses on the flat, non-hierarchical pod relationships. It contains:
        *   **Partner Pods:** A view that groups employees under their designated Pod Partner. This view includes a dedicated, collapsible section that reports on employees with pod relationship errors.
        *   **All Employees:** A comprehensive list of all employees in the selected offering. This view includes the employee's current Pod Lead Partner and allows for **filtering by location and talent group**. It also supports **bulk-moving employees** to a new pod.
        *   **Pod Moves Log:** A log of all temporary changes made to pod assignments.

*   **Visual Highlighting of Rules and Errors:** The application excels at visually representing the data quality issues and business rules:
    *   **Coaching Tree Mismatches:** In the tree view, nodes are colored differently if an employee is in a different location or a different operating unit from the Partner at the top of the tree.
    *   **Pod Mismatches:** In the Partner Pods view, an icon appears next to an employee's name if their Pod Partner is different from their Coaching Tree Partner. Rows and text are also colored to indicate different locations or offerings.
    *   **Workload Indicators:** An employee's name is highlighted in red if their number of direct reports exceeds a calculated threshold based on their FTE, flagging potential overload.
    *   **Rich Tooltips:** Hovering over any employee in the tree or pod views displays a detailed tooltip with information like their level, location, offering, talent group, and current coach.

*   **"What-If" Scenarios:** The application provides a safe environment to model organizational changes:
    *   **Move Employees:** Users can **right-click an employee** in the tree view to open a context menu and move them to a new coach.
    *   **Move Pod Members:** In the pods view, users can move one or more employees to a new Pod Partner. Checkboxes allow for **selecting multiple employees for a bulk move**.
    *   All these changes are temporary. They are logged and can be cleared, reverting the visualization to the original data generated by the Python script. This confirms that the web app is used to visualize data and allow users to model changes.
    *   **Change Management:** The coaching and pod move logs can be **downloaded as CSV files** for offline analysis. Individual pod moves can also be **reverted** directly from the UI.
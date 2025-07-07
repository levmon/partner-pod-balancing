# Project Summary: Partner Pod Balancing

This project is a two-part system designed for visualizing and analyzing organizational hierarchies from an employee spreadsheet. It consists of:

1.  A **Python script (`build_forest.py`)** that acts as a data processing and validation engine.
2.  A **web application (`index.html`)** that provides an interactive, visual interface to the processed data.

The system models two distinct types of employee relationships: a **Coaching Hierarchy** and a **Partner Pod** relationship.

---

## 1. Data Processing and Validation (`build_forest.py`)

The Python script is the foundation of the project. It reads an Excel file, cleans and validates the data, and then transforms it into a structured `forest.json` file that the web application can use.

**Key Functions:**

*   **Data Ingestion:** It loads data from `Employee Input Data.xlsx` using the `pandas` library. The `COLUMN_MAPPING` dictionary is crucial, as it allows the script to work with consistent internal names (`employee_id`, `coach_id`, etc.) even if the source Excel column names change.
*   **Data Validation:** This is a major feature of the script. Before building any hierarchies, it performs numerous checks inside the `validate_data` function:
    *   **Partner Identification:** It identifies "Partners" based on their "Level" (where `level` is 'Partner'). Partners are the top of the coaching hierarchies.
    *   **Coaching Chain Integrity:** It ensures every non-partner has a valid coach and that the coach exists in the employee list. Employees with invalid coaches are flagged.
    *   **Orphan Analysis:** It identifies "orphaned" employees who cannot be traced up to a Partner. The `find_broken_chain_root_cause` function is particularly insightful; it analyzes *why* an employee is an orphan (e.g., "Coaching chain terminates at 'X', who is not a Partner" or "coach 'Y' is a Retired Partner").
    *   **Cycle Detection:** It explicitly checks for and flags coaching cycles (e.g., A coaches B, and B coaches A), which would break the tree structure.
    *   **Partner Pod Validation:** It validates the `partner_relationship_id` to ensure it points to a valid, active Partner.
*   **Hierarchy Construction:**
    *   **Coaching Trees:** After validation, the script builds the coaching hierarchies by linking employees to their coaches. It calculates the total number of direct and indirect coachees for each person, which is used in the visualization.
    *   **JSON Export:** The final output is a single `forest.json` file containing two main sections:
        *   `all_partner_trees`: A list of all partners, with their entire coaching hierarchy nested inside as "children".
        *   `all_orphaned_employees`: A flat list of all employees who could not be placed in a tree, including the reason why.

---

## 2. Interactive Visualization (`index.html`)

The `index.html` file is a client-side web application that uses the **D3.js library** to create rich, interactive visualizations from the `forest.json` data.

**Key Features:**

*   **Tabbed Interface:** The application is organized into several tabs for different views of the data:
    *   **Partner Trees:** This is the primary view, showing the coaching hierarchies as interactive, collapsible tree diagrams. You can select an Operating Unit and then choose a specific Partner's tree to view.
    *   **Orphaned:** This tab displays a simple table of all orphaned employees for the selected Operating Unit, along with the specific reason they are considered orphaned, as determined by the Python script.
    *   **Partner Pods:** This view visualizes the flat, non-hierarchical "Partner Pod" relationships. It groups employees under their designated Pod Partner, which is separate from the coaching hierarchy.
    *   **Moves Logs:** Two tabs log the "what-if" changes a user makes to either the coaching tree or the partner pods. These changes are stored in the browser's local storage and are not permanent.

*   **Visual Highlighting of Rules and Errors:** The application excels at visually representing the data quality issues and business rules:
    *   **Coaching Tree Mismatches:** In the tree view, nodes are colored differently if an employee is in a different location or a different operating unit from the Partner at the top of the tree.
    *   **Pod Mismatches:** In the Partner Pods view, an icon appears next to an employee's name if their Pod Partner is different from their Coaching Tree Partner. Rows and text are also colored to indicate different locations or offerings.
    *   **Workload Indicators:** An employee's name is highlighted in red if their number of direct reports exceeds a calculated threshold based on their FTE, flagging potential overload.

*   **"What-If" Scenarios:** The application provides a safe environment to model organizational changes:
    *   **Move Employees:** Users can right-click an employee in the tree view to move them to a new coach.
    *   **Move Pod Members:** In the pods view, users can move one or more employees to a new Pod Partner.
    *   All these changes are temporary. They are logged and can be cleared, reverting the visualization to the original data generated by the Python script. This confirms that the web app is used to visualize data and allow users to model changes.
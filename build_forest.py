import pandas as pd
import json
from collections import defaultdict

# --- Configuration ---
EXCEL_FILE_PATH = '../../Employee Input Data.xlsx'
JSON_OUTPUT_PATH = 'forest.json'

# Mapping from conceptual model names to actual Excel column names
# Based on user input: "Employee ID", "Preferred Full Name", "Coach User Sys ID"
COLUMN_MAPPING = {
    'employee_id': 'Employee ID',
    'name': 'Preferred Full Name',
    'coach_id': 'Coach User Sys ID',
    'coach_name': 'Coach',
    'level': 'Level', # Added for partner identification
    'partner_relationship_id': 'Partner  Job Relationships User ID', # For Partner Pods feature
    'partner_relationship_name': 'Partner  Job Relationships Name', # For Partner Pods feature
    'talent_group': 'Talent Group'
}

# Actual column name in Excel for identifying Partners - now mapped to 'level'
# LEVEL_COLUMN_NAME = 'Level' # No longer needed as we use internal 'level'
PARTNER_LEVEL_VALUE = 'Partner'

# Columns that are essential for the structure
ESSENTIAL_COLUMNS = ['employee_id', 'name', 'coach_id', 'level'] # Added 'level'

# --- 1. Data Ingestion ---

# Columns to include in the employee records in the final JSON.
# These are column names as they exist in the DataFrame after initial COLUMN_MAPPING and renaming.
# Essential columns for script logic (e.g., employee_id, name, level, coach_id, Operating Unit Name)
# MUST be included here if their corresponding logic downstream is to be maintained.
INCLUDED_DATA_COLUMNS = [
    'employee_id',
    'name',
    'level',
    'coach_id',
    'coach_name',
    'Operating Unit Name',
    'Location  Name',
    'FTE',
    'partner_relationship_id', # For Partner Pods feature
    'partner_relationship_name', # For Partner Pods feature
    'pod_relationship_status', # For Partner Pods feature
    'talent_group',
    'coaching_tree_partner_id', # For cross-reference check
    # --- Add other desired data columns below ---
    # Example: If you have 'Job Title' or 'Department' columns in your Excel
    # and want them in the JSON, add them here.
    # If they are mapped in COLUMN_MAPPING, use their internal names.
    # Otherwise, use their original Excel column names.
    # 'Job Title',
    # 'Department',
]

def load_employee_data(file_path):
    """
    Loads employee data from the specified Excel file.
    Renames columns based on COLUMN_MAPPING.
    """
    try:
        df = pd.read_excel(file_path, engine='openpyxl')

        # All employees will be loaded. Filtering/categorization will happen later.
        # Rename columns for internal consistency
        # Create a reverse map for renaming: {excel_col_name: internal_name}
        rename_map = {v: k for k, v in COLUMN_MAPPING.items()}
        df.rename(columns=rename_map, inplace=True)

        # "Retired Partner" level employees will be handled after loading, not excluded here.
        
        # Ensure essential columns are present after renaming
        missing_essential = [col for col in ESSENTIAL_COLUMNS if col not in df.columns]
        if missing_essential:
            raise ValueError(f"Missing essential columns after renaming: {', '.join(missing_essential)}. "
                             f"Available columns: {', '.join(df.columns)}. "
                             f"Please check COLUMN_MAPPING and Excel file.")
                             
        # Convert ID columns to clean strings, removing '.0' from numbers read as floats
        def format_id(val):
            if pd.isna(val) or str(val).lower() in ['nan', 'none', '']:
                return None
            try:
                # Convert to float, then to int to drop decimals, then to string
                return str(int(float(val)))
            except (ValueError, TypeError):
                # If it can't be converted (e.g., a non-numeric string), return as is
                return str(val).strip()

        df['employee_id'] = df['employee_id'].apply(format_id)
        if 'coach_id' in df.columns:
            df['coach_id'] = df['coach_id'].apply(format_id)
        if 'partner_relationship_id' in df.columns:
            df['partner_relationship_id'] = df['partner_relationship_id'].apply(format_id)

        # Clean name columns
        if 'partner_relationship_name' in df.columns:
            df['partner_relationship_name'] = df['partner_relationship_name'].astype(str).replace(['nan', 'None', '', pd.NA], None)
        if 'coach_name' in df.columns:
            df['coach_name'] = df['coach_name'].astype(str).replace(['nan', 'None', '', pd.NA], None)

        return df
    except FileNotFoundError:
        print(f"Error: The file '{file_path}' was not found.")
        return None
    except Exception as e:
        print(f"Error loading or processing Excel file: {e}")
        return None

# --- 2. Data Validation ---
def validate_data(df):
    """
    Validates the DataFrame for unique IDs, coach_id integrity, and cycles.
    Returns a DataFrame (or None if critical errors) and a validation summary.
    """
    if df is None:
        return None, {"errors": ["Data loading failed."], "critical_errors": True}

    summary = {
        "total_employees_read": len(df),
        "partners_found": 0,
        "duplicate_ids": [],
        "orphan_coach_ids": [],
        "invalid_pod_ids": [],
        "cycles_detected": [],
        "errors": [],
        "warnings": [],
        "critical_errors": False
    }

    # Check for essential columns (employee_id, level are checked here, others implicitly by usage)
    if 'employee_id' not in df.columns:
        summary["errors"].append(f"Critical: Column '{COLUMN_MAPPING.get('employee_id', 'employee_id')}' (mapped to 'employee_id') not found.")
        summary["critical_errors"] = True
        # return None, summary # Allow other checks to run if possible

    if 'level' not in df.columns: # Check for the internal name 'level'
        summary["errors"].append(f"Critical: Column '{COLUMN_MAPPING.get('level', 'Level')}' (mapped to 'level') not found. Cannot determine Partners.")
        summary["critical_errors"] = True
        # return None, summary # Allow other checks

    if summary["critical_errors"]: # Early exit if essential mapped columns are missing
         return None, summary

    # Ensure 'level' column is string type for comparison, if it exists
    if 'level' in df.columns:
        df['level'] = df['level'].astype(str)

    # Convert employee_id to string
    df['employee_id'] = df['employee_id'].astype(str)
    all_employee_ids = set(df['employee_id'])

    # A. Unique IDs
    if df['employee_id'].duplicated().any():
        duplicates = df[df['employee_id'].duplicated()]['employee_id'].tolist()
        summary["duplicate_ids"] = list(set(duplicates))
        summary["errors"].append(f"Validation Error: Duplicate employee IDs found: {summary['duplicate_ids']}.")
        # summary["critical_errors"] = True # Decide if this is critical

    # B. Partner Identification & coach_id Integrity
    partners_identified_by_level = []
    non_partners_missing_coach = []

    has_coach_id_col = 'coach_id' in df.columns
    if has_coach_id_col:
        df['coach_id'] = df['coach_id'].astype(str).replace(['nan', 'None', ''], None)
    else:
        summary["warnings"].append(f"Warning: Column '{COLUMN_MAPPING.get('coach_id', 'coach_id')}' (mapped to 'coach_id') not found.")

    # Iterate and validate based on 'level'
    if 'level' in df.columns: # Proceed only if 'level' column exists
        for index, row in df.iterrows():
            employee_id = row['employee_id']
            # Use internal 'level' column for partner check
            is_partner = str(row['level']).strip() == PARTNER_LEVEL_VALUE

            if is_partner:
                partners_identified_by_level.append(employee_id)
            else:
                # This is a non-Partner
                if not has_coach_id_col: # If coach_id col itself is missing
                    non_partners_missing_coach.append(employee_id)
                    continue # Skip to next employee

                coach_id = row.get('coach_id') # Use .get() for safety, though has_coach_id_col is checked
                if not coach_id: # Coach_id is None or empty after standardization
                    non_partners_missing_coach.append(employee_id)
                elif coach_id not in all_employee_ids:
                    summary["orphan_coach_ids"].append(f"Non-Partner Employee '{employee_id}' has unknown coach '{coach_id}'")
    else: # 'level' column is missing, cannot determine partners correctly
        summary["errors"].append("Cannot determine Partners or validate coach structure as 'level' column is missing.")
        summary["critical_errors"] = True


    summary["partners_found"] = len(partners_identified_by_level)

    if non_partners_missing_coach:
        summary["errors"].append(f"Validation Error: Non-Partner employees found missing a coach_id (or coach_id column absent): {non_partners_missing_coach}")
        summary["critical_errors"] = True # Non-partners MUST have a coach

    if summary["orphan_coach_ids"]:
        summary["errors"].append(f"Validation Error: Orphan coach IDs found for non-Partners (coaches not in employee list).")
        # summary["critical_errors"] = True # Decide if critical

    # C. Pod Relationship Validation
    if 'partner_relationship_id' in df.columns:
        partner_ids = set(df[df['level'] == PARTNER_LEVEL_VALUE]['employee_id'])
        df['pod_relationship_status'] = "valid"

        for index, row in df.iterrows():
            pod_id = row['partner_relationship_id']
            if pd.notna(pod_id):
                if pod_id not in all_employee_ids or pod_id not in partner_ids:
                    df.loc[index, 'pod_relationship_status'] = "error_invalid_id"
            else:
                df.loc[index, 'pod_relationship_status'] = "error_invalid_id"

    else:
        summary["warnings"].append("Warning: 'Partner Job Relationships User ID' column not found. Pod feature will be disabled.")
        df['pod_relationship_status'] = "error_invalid_id"

    if summary["invalid_pod_ids"]:
        summary["errors"].append("Validation Error: Invalid Partner Pod relationships found.")

    # D. Cycle Detection (Build adjacency list only for non-Partners with valid coaches)
    adj = defaultdict(list)
    if has_coach_id_col and 'level' in df.columns and not summary["critical_errors"]: # Proceed if data is coherent enough
        for _, row in df.iterrows():
            employee_id = str(row['employee_id'])
            is_partner = str(row['level']).strip() == PARTNER_LEVEL_VALUE

            if not is_partner:
                coach_id = row['coach_id']
                if coach_id and coach_id in all_employee_ids: # Only add edge if coach is valid and employee is not partner
                    adj[coach_id].append(employee_id)

    visited_dfs = set() # For general DFS traversal tracking
    recursion_stack = set() # For tracking nodes in current recursion path for cycle detection

    def detect_cycle_util(node):
        visited_dfs.add(node)
        recursion_stack.add(node)

        for neighbour in adj.get(node, []):
            if neighbour not in visited_dfs:
                if detect_cycle_util(neighbour):
                    # Cycle detected downstream, propagate True
                    # Check if this node is part of the cycle before adding
                    # This part needs refinement to capture the actual cycle path
                    return True 
            elif neighbour in recursion_stack:
                # Cycle detected
                # Attempt to trace back the cycle (simplified, might not get full path easily here)
                # For now, just record the node where cycle is re-entered and the one causing it.
                summary["cycles_detected"].append(f"Cycle detected involving {neighbour} (re-entered) from {node}")
                return True
        
        recursion_stack.remove(node)
        return False

    if has_coach_id_col:
        all_nodes_in_adj = set(adj.keys()) | set(e for coachees in adj.values() for e in coachees)
        for node_id in all_nodes_in_adj: # Iterate over all unique IDs involved in relationships
            if node_id not in visited_dfs:
                if detect_cycle_util(node_id):
                    summary["errors"].append(f"Validation Error: Coaching cycles detected. Check 'cycles_detected' list.")
                    summary["critical_errors"] = True # Cycles are critical for tree structure
                    # No need to continue cycle detection if one is found and it's critical
                    break 
    
    if summary["errors"]: # If any errors were logged
        print("\n--- Validation Issues ---")
        for err in summary["errors"]:
            print(f"- {err}")
        if summary["orphan_coach_ids"]:
            print("Orphaned coach IDs (coach not in employee list):")
            for orphan in summary["orphan_coach_ids"]:
                print(f"  - {orphan}")
        if summary["invalid_pod_ids"]:
            print("Invalid Partner Pod relationships (pod coach is not a valid partner):")
            for invalid_pod in summary["invalid_pod_ids"]:
                print(f"  - {invalid_pod}")
        if summary["duplicate_ids"]:
             print(f"Duplicate Employee IDs: {summary['duplicate_ids']}")
        if summary["cycles_detected"] and summary["critical_errors"]:
            print("Cycles Found (may be partial list if detection stopped early):")
            for cycle_info in summary["cycles_detected"]:
                print(f"  - {cycle_info}")
        print("-------------------------\n")


    if summary["critical_errors"]:
        return None, summary
        
    return df, summary

# --- 3. Validation Summary Reporting ---
def print_validation_summary(summary):
    """Prints the validation summary to the console."""
    print("\n--- Data Validation Summary ---")
    print(f"Total employees read: {summary.get('total_employees_read', 'N/A')}")
    print(f"Partners (no coach_id) found: {summary.get('partners_found', 'N/A')}")
    
    if summary.get("duplicate_ids"):
        print(f"Duplicate employee IDs: {summary['duplicate_ids']}")
    else:
        print("Duplicate employee IDs: None found.")

    if summary.get("orphan_coach_ids"):
        print(f"Orphan coach IDs (coach not in employee list): {len(summary['orphan_coach_ids'])}")
        # for orphan in summary["orphan_coach_ids"][:5]: # Print a few examples
        #     print(f"  - {orphan}")
        # if len(summary["orphan_coach_ids"]) > 5:
        #     print(f"  ... and {len(summary['orphan_coach_ids']) - 5} more.")
    else:
        print("Orphan coach IDs: None found.")

    if summary.get("cycles_detected"):
        print(f"Coaching cycles detected: {summary['cycles_detected']}")
    else:
        print("Coaching cycles: None detected.")

    if summary.get("invalid_pod_ids"):
        print(f"Invalid pod relationships: {len(summary['invalid_pod_ids'])} found.")
    else:
        print("Pod relationships: All valid.")
    
    if summary.get("warnings"):
        print("Warnings:")
        for warn in summary["warnings"]:
            print(f"  - {warn}")
            
    if summary.get("critical_errors"):
        print("\nCRITICAL ERRORS FOUND. Forest construction aborted.")
    else:
        print("\nValidation successful or non-critical issues found. Proceeding to build forest.")
    print("-----------------------------\n")

# --- 4. Tree Construction ---
# (Commented out 'build_coaching_forest' function and related comments removed as per user request)
# --- 5. JSON Export ---
def export_to_json(data_to_export, output_path):
    """Exports the structured data to a JSON file."""
    try:
        with open(output_path, 'w') as f:
            json.dump(data_to_export, f, indent=2)
        print(f"Successfully exported data to '{output_path}'")
    except Exception as e:
        print(f"Error exporting to JSON: {e}")

# --- Helper function to count descendants (can be defined globally or within main) ---
def count_all_descendants(node_dict):
    count = 0
    if node_dict.get('children'):
        count += len(node_dict['children']) # Direct children
        for child in node_dict['children']:
            count += count_all_descendants(child) # Indirect children (recursive)
    return count

def stamp_root_partner_id(node, root_id):
    """Recursively add the root partner's ID to each node in a tree."""
    node['coaching_tree_partner_id'] = root_id
    for child in node.get('children', []):
        stamp_root_partner_id(child, root_id)

def find_broken_chain_root_cause(employee_id, all_nodes, all_ids_set, retired_partners_map):
    """
    Traces an employee's coaching chain upwards to find the root cause of why they are orphaned.
    """
    visited_ids = set()
    current_id = employee_id
    
    while current_id:
        if current_id in visited_ids:
            # Cycle detected
            return f"Coaching chain is broken due to a cycle involving employee ID {current_id}."
        visited_ids.add(current_id)

        current_node = all_nodes.get(current_id)
        if not current_node:
            # This case should ideally not be hit if we start from a valid employee
            return f"Analysis error: Could not find employee ID {current_id} in the dataset."

        coach_id = current_node.get('coach_id')

        if not coach_id:
            # This is the top of the chain for this employee.
            # Check if this top-level person is a Partner.
            if current_node.get('level') != PARTNER_LEVEL_VALUE:
                top_level_name = current_node.get('name', 'Unknown')
                return f"Coaching chain terminates at '{top_level_name}' (ID: {current_id}), who is not a Partner."
            else:
                # This should not happen for an orphan, as they would have been stamped.
                return "This employee appears to be in a valid tree, but was marked as an orphan."
        
        # Now, check if the coach_id is valid
        if coach_id not in all_ids_set:
            current_name = current_node.get('name', 'Unknown')
            
            # Check if the invalid coach is a known retired partner
            if coach_id in retired_partners_map:
                retired_coach_name = retired_partners_map[coach_id].get('name', 'Unknown')
                return f"Coaching chain breaks at '{current_name}' (ID: {current_id}), because the listed coach '{retired_coach_name}' (ID: {coach_id}) is a Retired Partner."

            # Otherwise, it's a truly invalid ID
            coach_name = current_node.get('coach_name', '[Name Not Found In File]')
            return f"Coaching chain breaks at '{current_name}' (ID: {current_id}), whose listed coach '{coach_name}' (ID: {coach_id}) is invalid."

        # Move up the chain
        current_id = coach_id
        
    return "Unknown reason for being orphaned." # Fallback

# --- 6. Main Execution Flow ---
if __name__ == "__main__":
    print(f"Starting script: Reading data from '{EXCEL_FILE_PATH}'...")
    
    employee_df_raw = load_employee_data(EXCEL_FILE_PATH)
    
    if employee_df_raw is not None:
        print(f"Successfully loaded {len(employee_df_raw)} records.")

        # Separate Retired Partners before validation and tree building
        retired_partners_map = {}
        if 'level' in employee_df_raw.columns:
            retired_mask = employee_df_raw['level'] == 'Retired Partner'
            retired_df = employee_df_raw[retired_mask]
            # Create a map of retired partners by their ID for later reference
            for _, row in retired_df.iterrows():
                retired_id = str(row['employee_id'])
                retired_partners_map[retired_id] = {'name': row['name']}
            
            # Exclude retired partners from the main DataFrame for processing
            active_employee_df = employee_df_raw[~retired_mask]
            print(f"Identified and separated {len(retired_df)} Retired Partners.")
        else:
            active_employee_df = employee_df_raw

        # Validate the active dataset
        validated_df, validation_summary = validate_data(active_employee_df.copy())
        print_validation_summary(validation_summary)
        
        if not validation_summary.get("critical_errors", False) and validated_df is not None:
            print("Processing all employees to build full hierarchy and identify reports...")

            all_employee_nodes = {}
            all_partner_trees = []
            
            # 1. Populate all_employee_nodes with initial node structures
            for _, row in validated_df.iterrows():
                node_id = str(row['employee_id'])
                node_data = {col: row.get(col) for col in INCLUDED_DATA_COLUMNS if pd.notna(row.get(col))}
                if 'Location Name' in node_data: # Handle space inconsistency
                    node_data['Location  Name'] = node_data.pop('Location Name')
                node_data['id'] = node_id
                node_data['children'] = []
                all_employee_nodes[node_id] = node_data

            # 2. Build full organizational trees
            all_employees_in_trees = set()
            for emp_id, node_dict in all_employee_nodes.items():
                if node_dict.get('level') == PARTNER_LEVEL_VALUE:
                    all_partner_trees.append(node_dict)
                else:
                    coach_id = node_dict.get('coach_id')
                    if coach_id and coach_id in all_employee_nodes:
                        all_employee_nodes[coach_id]['children'].append(node_dict)
            
            # 3. Calculate counts and stamp tree info
            for partner_node in all_partner_trees:
                partner_node['indirect_coachee_count'] = count_all_descendants(partner_node)
                stamp_root_partner_id(partner_node, partner_node['id'])

            for emp_id, node_data_item in all_employee_nodes.items():
                node_data_item['direct_coachee_count'] = len(node_data_item.get('children', []))

            # 4. Identify true orphans
            all_orphaned_employees = []
            all_employee_ids = set(all_employee_nodes.keys()) # All valid IDs
            for emp_id, node_dict in all_employee_nodes.items():
                # An orphan is a non-partner who wasn't stamped as belonging to a partner's tree.
                if 'coaching_tree_partner_id' not in node_dict and node_dict.get('level') != PARTNER_LEVEL_VALUE:
                    report_node_copy = node_dict.copy()
                    if 'children' in report_node_copy:
                        del report_node_copy['children']
                    
                    # Use the new function to find the detailed root cause.
                    reason = find_broken_chain_root_cause(emp_id, all_employee_nodes, all_employee_ids, retired_partners_map)
                    
                    report_node_copy['reason_for_listing'] = reason
                    all_orphaned_employees.append(report_node_copy)

            # 5. Set pod relationship status for different offerings
            for emp_id, node_dict in all_employee_nodes.items():
                if node_dict.get('pod_relationship_status') == 'valid':
                    pod_partner_id = node_dict.get('partner_relationship_id')
                    if pod_partner_id and pod_partner_id in all_employee_nodes:
                        pod_partner_offering = all_employee_nodes[pod_partner_id].get('Operating Unit Name')
                        employee_offering = node_dict.get('Operating Unit Name')
                        if pod_partner_offering and employee_offering and pod_partner_offering != employee_offering:
                            node_dict['pod_relationship_status'] = 'warning_different_offering'
            
            print(f"Identified {len(all_orphaned_employees)} true orphaned employees.")

            # 6. Prepare Final JSON Output
            output_data = {
                "all_partner_trees": all_partner_trees,
                "all_orphaned_employees": all_orphaned_employees
            }
            
            export_to_json(output_data, JSON_OUTPUT_PATH)
        else:
            print("Script aborted due to critical validation errors.")
    else:
        print("Script aborted due to data loading failure.")

    print("Script finished.")
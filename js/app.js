$(document).ready(function() {
    // Global variables
    let comparisonData = null;
    
    // Event listeners
    $('#newComparisonBtn').on('click', showPopupForm);
    $('#startComparisonBtn').on('click', showPopupForm);
    $('#popupClose').on('click', hidePopupForm);
    $('#cancelBtn').on('click', hidePopupForm);
    $('#compareBtn').on('click', compareDatabases);
    $('#exportReportBtn').on('click', exportReport);
    
    // Close popup when clicking outside
    $('#popupOverlay').on('click', function(e) {
        if (e.target === this) {
            hidePopupForm();
        }
    });
    
    // Tab navigation
    $('.tab-btn').on('click', function() {
        const tab = $(this).data('tab');
        switchTab(tab);
    });
    
    // Initialize the application
    init();
    
    function init() {
        // Set default values or load from localStorage if available
        loadSavedConnections();
        showEmptyState();
    }
    
    function loadSavedConnections() {
        // Load saved connection details from localStorage if available
        const saved = localStorage.getItem('dbConnections');
        if (saved) {
            const connections = JSON.parse(saved);
            $('#db1_host').val(connections.db1?.host || 'localhost');
            $('#db1_username').val(connections.db1?.username || 'root');
            $('#db1_password').val(connections.db1?.password || 'root');
            $('#db1_database').val(connections.db1?.database || 'db1');
            
            $('#db2_host').val(connections.db2?.host || 'localhost');
            $('#db2_username').val(connections.db2?.username || 'root');
            $('#db2_password').val(connections.db2?.password || 'root');
            $('#db2_database').val(connections.db2?.database || 'db2');
        }
    }
    
    function saveConnections() {
        const connections = {
            db1: {
                host: $('#db1_host').val(),
                username: $('#db1_username').val(),
                password: $('#db1_password').val(),
                database: $('#db1_database').val()
            },
            db2: {
                host: $('#db2_host').val(),
                username: $('#db2_username').val(),
                password: $('#db2_password').val(),
                database: $('#db2_database').val()
            }
        };
        localStorage.setItem('dbConnections', JSON.stringify(connections));
    }
    
    function showPopupForm() {
        $('#popupOverlay').addClass('active');
        $('body').addClass('popup-open'); // Lock body scroll
        setTimeout(() => { $('#db1_host').focus(); }, 300);
    }
    
    function hidePopupForm() {
        $('#popupOverlay').removeClass('active');
        $('body').removeClass('popup-open'); // Unlock body scroll
    }
    
    function showEmptyState() {
        $('#emptyState').show();
        $('#resultsSection').hide();
        $('#exportReportBtn').hide();
    }
    
    function showResultsSection() {
        $('#emptyState').hide();
        $('#resultsSection').show();
        $('#exportReportBtn').show();
    }
    
    function compareDatabases() {
        // Validate form
        if (!validateForm()) {
            return;
        }
        
        // Save connections
        saveConnections();
        
        // Hide popup
        hidePopupForm();
        
        // Show loading spinner
        showLoading(true);
        
        // Prepare request data
        const requestData = {
            db1: {
                connection_host: $('#db1_host').val(),
                connection_username: $('#db1_username').val(),
                connection_password: $('#db1_password').val(),
                connection_database: $('#db1_database').val()
            },
            db2: {
                connection_host: $('#db2_host').val(),
                connection_username: $('#db2_username').val(),
                connection_password: $('#db2_password').val(),
                connection_database: $('#db2_database').val()
            }
        };
        
        // Make API call
        $.ajax({
            url: 'api_v1/dbdiff.php',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            success: function(response) {
                handleApiResponse(response);
            },
            error: function(xhr, status, error) {
                handleApiError(xhr, status, error);
            },
            complete: function() {
                showLoading(false);
            }
        });
    }
    
    function validateForm() {
        const requiredFields = [
            'db1_host', 'db1_username', 'db1_password', 'db1_database',
            'db2_host', 'db2_username', 'db2_password', 'db2_database'
        ];
        
        let isValid = true;
        
        requiredFields.forEach(field => {
            const value = $(`#${field}`).val().trim();
            if (!value) {
                showError(`Please fill in all required fields.`);
                isValid = false;
                return false;
            }
        });
        
        return isValid;
    }
    
    function handleApiResponse(response) {
        try {
            // Parse response if it's a string
            if (typeof response === 'string') {
                response = JSON.parse(response);
            }
            
            if (response.status === '1') {
                // Success response
                comparisonData = response.data;
                showSuccess(response.message);
                displayResults(response.data);
                showResultsSection();
            } else {
                // Error response
                showError(response.message || 'An error occurred during comparison.');
            }
        } catch (error) {
            console.error('Error parsing response:', error);
            showError('Invalid response format from server.');
        }
    }
    
    function handleApiError(xhr, status, error) {
        console.error('API Error:', xhr, status, error);
        
        let errorMessage = 'An error occurred while connecting to the server.';
        
        if (xhr.responseText) {
            try {
                const errorResponse = JSON.parse(xhr.responseText);
                errorMessage = errorResponse.message || errorMessage;
            } catch (e) {
                // If response is not JSON, use status text
                errorMessage = xhr.statusText || errorMessage;
            }
        }
        
        showError(errorMessage);
    }
    
    function displayResults(data) {
        // Calculate summary statistics
        const summary = calculateSummary(data);
        
        // Update summary cards
        updateSummaryCards(summary);
        
        // Display detailed results
        displayMissingTables(data.missing_table);
        displayColumnIssues(data.missing_column);
        displayStructureIssues(data.structure_missmatch_table);
        displayTypeIssues(data.structure_missmatch_table_column);
        displayObjectIssues(data);
        displayIndexIssues(data.missing_index);
        displayForeignKeyIssues(data.missing_foreign_key);
        displayViewIssues(data.missing_view);
        
        // Update tab badges with actual counts
        updateTabBadges(data);
    }
    
    function calculateSummary(data) {
        const summary = {
            totalIssues: 0,
            missingTables: 0,
            columnIssues: 0,
            dbObjects: 0
        };
        
        // Count missing tables
        if (data.missing_table) {
            summary.missingTables += (data.missing_table.db1?.length || 0);
            summary.missingTables += (data.missing_table.db2?.length || 0);
        }
        
        // Count column issues (missing columns + structure + type issues)
        if (data.missing_column) {
            Object.keys(data.missing_column.db1 || {}).forEach(table => {
                summary.columnIssues += data.missing_column.db1[table].length;
            });
            Object.keys(data.missing_column.db2 || {}).forEach(table => {
                summary.columnIssues += data.missing_column.db2[table].length;
            });
        }
        
        // Count structure mismatches (table level)
        if (data.structure_missmatch_table) {
            summary.columnIssues += data.structure_missmatch_table.length;
        }
        
        // Count type mismatches (column level)
        if (data.structure_missmatch_table_column) {
            Object.keys(data.structure_missmatch_table_column || {}).forEach(table => {
                summary.columnIssues += data.structure_missmatch_table_column[table].length;
            });
        }
        
        // Note: structure_missmatch_table_column (type issues) are counted separately
        // and will be added to totalIssues but not to columnIssues
        
        // Count database objects
        if (data.missing_function) {
            summary.dbObjects += (data.missing_function.db1?.length || 0);
            summary.dbObjects += (data.missing_function.db2?.length || 0);
        }
        if (data.missing_procedure) {
            summary.dbObjects += (data.missing_procedure.db1?.length || 0);
            summary.dbObjects += (data.missing_procedure.db2?.length || 0);
        }
        if (data.missing_event) {
            summary.dbObjects += (data.missing_event.db1?.length || 0);
            summary.dbObjects += (data.missing_event.db2?.length || 0);
        }
        if (data.missing_trigger) {
            summary.dbObjects += (data.missing_trigger.db1?.length || 0);
            summary.dbObjects += (data.missing_trigger.db2?.length || 0);
        }
        
        // Add indexes, foreign keys, views to total
        let additionalIssues = 0;
        if (data.missing_index) {
            additionalIssues += (data.missing_index.db1?.length || 0);
            additionalIssues += (data.missing_index.db2?.length || 0);
        }
        if (data.missing_foreign_key) {
            additionalIssues += (data.missing_foreign_key.db1?.length || 0);
            additionalIssues += (data.missing_foreign_key.db2?.length || 0);
        }
        if (data.missing_view) {
            additionalIssues += (data.missing_view.db1?.length || 0);
            additionalIssues += (data.missing_view.db2?.length || 0);
        }
        
        // Calculate total issues
        summary.totalIssues = summary.missingTables + summary.columnIssues + summary.dbObjects + additionalIssues;
        
        return summary;
    }
    
    function updateSummaryCards(summary) {
        $('#totalIssues').text(summary.totalIssues);
        $('#missingTables').text(summary.missingTables);
        $('#columnIssues').text(summary.columnIssues);
        $('#dbObjects').text(summary.dbObjects);
    }
    
    function updateTabBadges(data) {
        // Calculate actual counts for each tab
        let tablesCount = 0;
        let columnsCount = 0;
        let structureCount = 0;
        let typesCount = 0;
        let objectsCount = 0;
        
        // Tables count
        if (data.missing_table) {
            tablesCount += (data.missing_table.db1?.length || 0);
            tablesCount += (data.missing_table.db2?.length || 0);
        }
        
        // Columns count (missing columns + structure mismatches)
        if (data.missing_column) {
            Object.keys(data.missing_column.db1 || {}).forEach(table => {
                columnsCount += data.missing_column.db1[table].length;
            });
            Object.keys(data.missing_column.db2 || {}).forEach(table => {
                columnsCount += data.missing_column.db2[table].length;
            });
        }
        
        // Add structure mismatches to column count
        if (data.structure_missmatch_table) {
            columnsCount += data.structure_missmatch_table.length;
        }
        
        // Add type mismatches to column count
        if (data.structure_missmatch_table_column) {
            Object.keys(data.structure_missmatch_table_column || {}).forEach(table => {
                columnsCount += data.structure_missmatch_table_column[table].length;
            });
        }
        
        // Structure count
        if (data.structure_missmatch_table) {
            structureCount += data.structure_missmatch_table.length;
        }
        
        // Types count (from structure_missmatch_table_column)
        if (data.structure_missmatch_table_column) {
            Object.keys(data.structure_missmatch_table_column || {}).forEach(table => {
                typesCount += data.structure_missmatch_table_column[table].length;
            });
        }
        
        // Objects count
        if (data.missing_function) {
            objectsCount += (data.missing_function.db1?.length || 0);
            objectsCount += (data.missing_function.db2?.length || 0);
        }
        if (data.missing_procedure) {
            objectsCount += (data.missing_procedure.db1?.length || 0);
            objectsCount += (data.missing_procedure.db2?.length || 0);
        }
        if (data.missing_event) {
            objectsCount += (data.missing_event.db1?.length || 0);
            objectsCount += (data.missing_event.db2?.length || 0);
        }
        if (data.missing_trigger) {
            objectsCount += (data.missing_trigger.db1?.length || 0);
            objectsCount += (data.missing_trigger.db2?.length || 0);
        }
        
        // Indexes count
        let indexesCount = 0;
        if (data.missing_index) {
            indexesCount += (data.missing_index.db1?.length || 0);
            indexesCount += (data.missing_index.db2?.length || 0);
        }
        
        // Foreign keys count
        let foreignKeysCount = 0;
        if (data.missing_foreign_key) {
            foreignKeysCount += (data.missing_foreign_key.db1?.length || 0);
            foreignKeysCount += (data.missing_foreign_key.db2?.length || 0);
        }
        
        // Views count
        let viewsCount = 0;
        if (data.missing_view) {
            viewsCount += (data.missing_view.db1?.length || 0);
            viewsCount += (data.missing_view.db2?.length || 0);
        }
        
        // Update badges
        $('#missingTablesBadge').text(`${tablesCount} issues`);
        $('#columnIssuesBadge').text(`${columnsCount} issues`);
        $('#structureIssuesBadge').text(`${structureCount} issues`);
        $('#typeIssuesBadge').text(`${typesCount} issues`);
        $('#objectIssuesBadge').text(`${objectsCount} issues`);
        $('#indexIssuesBadge').text(`${indexesCount} issues`);
        $('#foreignKeyIssuesBadge').text(`${foreignKeysCount} issues`);
        $('#viewIssuesBadge').text(`${viewsCount} issues`);
    }
    
    function displayMissingTables(missingTableData) {
        const db1Cards = $('#db1MissingTablesCards');
        const db2Cards = $('#db2MissingTablesCards');
        
        db1Cards.empty();
        db2Cards.empty();
        
        // Display tables missing in DB1
        if (missingTableData.db1 && missingTableData.db1.length > 0) {
            $('#db1MissingTablesBadge').text(missingTableData.db1.length);
            missingTableData.db1.forEach(item => {
                const card = createIssueCard(item.table_name, item.message, item.query);
                db1Cards.append(card);
            });
        } else {
            $('#db1MissingTablesBadge').text('0');
        }
        
        // Display tables missing in DB2
        if (missingTableData.db2 && missingTableData.db2.length > 0) {
            $('#db2MissingTablesBadge').text(missingTableData.db2.length);
            missingTableData.db2.forEach(item => {
                const card = createIssueCard(item.table_name, item.message, item.query);
                db2Cards.append(card);
            });
        } else {
            $('#db2MissingTablesBadge').text('0');
        }
    }
    
    function displayColumnIssues(missingColumnData) {
        const cardsContainer = $('#columnIssuesCards');
        cardsContainer.empty();
        
        // Display missing columns
        if (missingColumnData) {
            // DB1 missing columns
            if (missingColumnData.db1) {
                Object.keys(missingColumnData.db1).forEach(table => {
                    missingColumnData.db1[table].forEach(item => {
                        const card = createIssueCard(
                            `${table}.${item.column_name}`,
                            item.message,
                            item.query
                        );
                        cardsContainer.append(card);
                    });
                });
            }
            
            // DB2 missing columns
            if (missingColumnData.db2) {
                Object.keys(missingColumnData.db2).forEach(table => {
                    missingColumnData.db2[table].forEach(item => {
                        const card = createIssueCard(
                            `${table}.${item.column_name}`,
                            item.message,
                            item.query
                        );
                        cardsContainer.append(card);
                    });
                });
            }
        }
    }
    
    function displayStructureIssues(structureData) {
        const cardsContainer = $('#structureIssuesCards');
        cardsContainer.empty();
        
        if (structureData && structureData.length > 0) {
            structureData.forEach(item => {
                const card = createIssueCard(
                    item.table_name,
                    item.message,
                    item.query_to_match_db1
                );
                cardsContainer.append(card);
            });
        }
    }
    
    function displayTypeIssues(structureData) {
        const cardsContainer = $('#typeIssuesCards');
        cardsContainer.empty();

        if (structureData) {
            Object.keys(structureData).forEach(table => {
                structureData[table].forEach(item => {
                    const card = createIssueCard(
                        `${table}.${item.column_name}`,
                        item.message,
                        item.query_to_match_db1
                    );
                    cardsContainer.append(card);
                });
            });
        }
    }
    
    function displayObjectIssues(data) {
        const cardsContainer = $('#objectIssuesCards');
        cardsContainer.empty();
        
        // Display functions, procedures, events, triggers
        const objectTypes = ['missing_function', 'missing_procedure', 'missing_event', 'missing_trigger'];
        
        objectTypes.forEach(type => {
            if (data[type]) {
                if (data[type].db1 && data[type].db1.length > 0) {
                    data[type].db1.forEach(item => {
                        const card = createIssueCard(
                            item.table_name,
                            item.message,
                            item.query
                        );
                        cardsContainer.append(card);
                    });
                }
                
                if (data[type].db2 && data[type].db2.length > 0) {
                    data[type].db2.forEach(item => {
                        const card = createIssueCard(
                            item.table_name,
                            item.message,
                            item.query
                        );
                        cardsContainer.append(card);
                    });
                }
            }
        });
    }
    
    function displayIndexIssues(indexData) {
        const cardsContainer = $('#indexIssuesCards');
        cardsContainer.empty();
        
        if (indexData) {
            if (indexData.db1 && indexData.db1.length > 0) {
                indexData.db1.forEach(item => {
                    const card = createIssueCard(
                        `${item.table_name}.${item.index_name}`,
                        item.message,
                        item.query
                    );
                    cardsContainer.append(card);
                });
            }
            
            if (indexData.db2 && indexData.db2.length > 0) {
                indexData.db2.forEach(item => {
                    const card = createIssueCard(
                        `${item.table_name}.${item.index_name}`,
                        item.message,
                        item.query
                    );
                    cardsContainer.append(card);
                });
            }
        }
    }
    
    function displayForeignKeyIssues(fkData) {
        const cardsContainer = $('#foreignKeyIssuesCards');
        cardsContainer.empty();
        
        if (fkData) {
            if (fkData.db1 && fkData.db1.length > 0) {
                fkData.db1.forEach(item => {
                    const card = createIssueCard(
                        `${item.table_name}.${item.constraint_name}`,
                        item.message,
                        item.query
                    );
                    cardsContainer.append(card);
                });
            }
            
            if (fkData.db2 && fkData.db2.length > 0) {
                fkData.db2.forEach(item => {
                    const card = createIssueCard(
                        `${item.table_name}.${item.constraint_name}`,
                        item.message,
                        item.query
                    );
                    cardsContainer.append(card);
                });
            }
        }
    }
    
    function displayViewIssues(viewData) {
        const cardsContainer = $('#viewIssuesCards');
        cardsContainer.empty();
        
        if (viewData) {
            if (viewData.db1 && viewData.db1.length > 0) {
                viewData.db1.forEach(item => {
                    const card = createIssueCard(
                        item.view_name,
                        item.message,
                        item.query
                    );
                    cardsContainer.append(card);
                });
            }
            
            if (viewData.db2 && viewData.db2.length > 0) {
                viewData.db2.forEach(item => {
                    const card = createIssueCard(
                        item.view_name,
                        item.message,
                        item.query
                    );
                    cardsContainer.append(card);
                });
            }
        }
    }
    
    function createIssueCard(title, description, query) {
        const cardId = 'card_' + Math.random().toString(36).substr(2, 9);
        return `
            <div class="issue-card" id="${cardId}">
                <div class="issue-card-header">
                    <div class="issue-content">
                        <div class="issue-title">${title}</div>
                        <div class="issue-description">${description}</div>
                    </div>
                    <div class="issue-actions">
                        <button class="btn-copy" data-query="${query.replace(/"/g, '&quot;')}">
                            <i class="fas fa-copy"></i>
                            Copy Query
                        </button>
                        <button class="btn-dropdown" data-target="${cardId}">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                </div>
                <div class="issue-details" style="display: none;">
                    <div class="query-preview">
                        <h4>SQL Query:</h4>
                        <pre><code>${query}</code></pre>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Add event delegation for copy and accordion functionality
    $(document).on('click', '.btn-copy', function() {
        const query = $(this).data('query');
        copyToClipboard(query);
    });
    
    $(document).on('click', '.btn-dropdown', function() {
        const targetId = $(this).data('target');
        const card = $('#' + targetId);
        const details = card.find('.issue-details');
        const icon = $(this).find('i');
        
        if (details.is(':visible')) {
            details.slideUp(300);
            icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            details.slideDown(300);
            icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });
    
    function switchTab(tabName) {
        // Remove active class from all tabs and panes
        $('.tab-btn').removeClass('active');
        $('.tab-pane').removeClass('active');
        
        // Add active class to selected tab and pane
        $(`.tab-btn[data-tab="${tabName}"]`).addClass('active');
        $(`#${tabName}-tab`).addClass('active');
    }
    
    function showLoading(show) {
        if (show) {
            $('#loadingSpinner').show();
        } else {
            $('#loadingSpinner').hide();
        }
    }
    
    function showSuccess(message) {
        $('#statusMessage')
            .removeClass('error')
            .addClass('success')
            .show();
        $('#statusText').text(message);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            $('#statusMessage').fadeOut();
        }, 5000);
    }
    
    function showError(message) {
        $('#statusMessage')
            .removeClass('success')
            .addClass('error')
            .show();
        $('#statusText').text(message);
        
        // Auto-hide after 8 seconds for errors
        setTimeout(() => {
            $('#statusMessage').fadeOut();
        }, 8000);
    }
    
    function exportReport() {
        if (!comparisonData) {
            showError('No comparison data available to export.');
            return;
        }
        
        // Create a comprehensive report
        const report = generateReport(comparisonData);
        
        // Create and download the file
        const blob = new Blob([report], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database-comparison-report-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
    
    function generateReport(data) {
        const summary = calculateSummary(data);
        let report = 'DATABASE COMPARISON REPORT\n';
        report += '='.repeat(50) + '\n\n';
        report += `Generated: ${new Date().toLocaleString()}\n\n`;
        
        // Summary
        report += 'SUMMARY\n';
        report += '-'.repeat(20) + '\n';
        report += `Total Issues: ${summary.totalIssues}\n`;
        report += `Missing Tables: ${summary.missingTables}\n`;
        report += `Column Issues: ${summary.columnIssues}\n`;
        report += `DB Objects: ${summary.dbObjects}\n`;
        
        // Add counts for new features
        let indexCount = 0;
        if (data.missing_index) {
            indexCount += (data.missing_index.db1?.length || 0);
            indexCount += (data.missing_index.db2?.length || 0);
        }
        
        let fkCount = 0;
        if (data.missing_foreign_key) {
            fkCount += (data.missing_foreign_key.db1?.length || 0);
            fkCount += (data.missing_foreign_key.db2?.length || 0);
        }
        
        let viewCount = 0;
        if (data.missing_view) {
            viewCount += (data.missing_view.db1?.length || 0);
            viewCount += (data.missing_view.db2?.length || 0);
        }
        
        report += `Index Issues: ${indexCount}\n`;
        report += `Foreign Key Issues: ${fkCount}\n`;
        report += `View Issues: ${viewCount}\n\n`;
        
        // Missing Tables
        if (data.missing_table) {
            report += 'MISSING TABLES\n';
            report += '-'.repeat(20) + '\n';
            
            if (data.missing_table.db1 && data.missing_table.db1.length > 0) {
                report += 'Missing in Database 1:\n';
                data.missing_table.db1.forEach(item => {
                    report += `- ${item.table_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
            
            if (data.missing_table.db2 && data.missing_table.db2.length > 0) {
                report += 'Missing in Database 2:\n';
                data.missing_table.db2.forEach(item => {
                    report += `- ${item.table_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
        }
        
        // Column Issues
        if (data.missing_column) {
            report += 'MISSING COLUMNS\n';
            report += '-'.repeat(20) + '\n';
            
            if (data.missing_column.db1) {
                Object.keys(data.missing_column.db1).forEach(table => {
                    data.missing_column.db1[table].forEach(item => {
                        report += `- ${table}.${item.column_name}: ${item.message}\n`;
                        report += `  Query: ${item.query}\n\n`;
                    });
                });
            }
            
            if (data.missing_column.db2) {
                Object.keys(data.missing_column.db2).forEach(table => {
                    data.missing_column.db2[table].forEach(item => {
                        report += `- ${table}.${item.column_name}: ${item.message}\n`;
                        report += `  Query: ${item.query}\n\n`;
                    });
                });
            }
        }
        
        // Structure Issues
        if (data.structure_missmatch_table && data.structure_missmatch_table.length > 0) {
            report += 'STRUCTURE ISSUES\n';
            report += '-'.repeat(20) + '\n';
            
            data.structure_missmatch_table.forEach(item => {
                report += `- ${item.table_name}: ${item.message}\n`;
                report += `  Query: ${item.query_to_match_db1}\n\n`;
            });
        }
        
        // Type Issues
        if (data.structure_missmatch_table_column) {
            report += 'TYPE ISSUES\n';
            report += '-'.repeat(20) + '\n';
            
            Object.keys(data.structure_missmatch_table_column).forEach(table => {
                data.structure_missmatch_table_column[table].forEach(item => {
                    report += `- ${table}.${item.column_name}: ${item.message}\n`;
                    report += `  Query: ${item.query_to_match_db1}\n\n`;
                });
            });
        }
        
        // Index Issues
        if (data.missing_index) {
            report += 'INDEX ISSUES\n';
            report += '-'.repeat(20) + '\n';
            
            if (data.missing_index.db1 && data.missing_index.db1.length > 0) {
                report += 'Missing in Database 1:\n';
                data.missing_index.db1.forEach(item => {
                    report += `- ${item.table_name}.${item.index_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
            
            if (data.missing_index.db2 && data.missing_index.db2.length > 0) {
                report += 'Missing in Database 2:\n';
                data.missing_index.db2.forEach(item => {
                    report += `- ${item.table_name}.${item.index_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
        }
        
        // Foreign Key Issues
        if (data.missing_foreign_key) {
            report += 'FOREIGN KEY ISSUES\n';
            report += '-'.repeat(20) + '\n';
            
            if (data.missing_foreign_key.db1 && data.missing_foreign_key.db1.length > 0) {
                report += 'Missing in Database 1:\n';
                data.missing_foreign_key.db1.forEach(item => {
                    report += `- ${item.table_name}.${item.constraint_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
            
            if (data.missing_foreign_key.db2 && data.missing_foreign_key.db2.length > 0) {
                report += 'Missing in Database 2:\n';
                data.missing_foreign_key.db2.forEach(item => {
                    report += `- ${item.table_name}.${item.constraint_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
        }
        
        // View Issues
        if (data.missing_view) {
            report += 'VIEW ISSUES\n';
            report += '-'.repeat(20) + '\n';
            
            if (data.missing_view.db1 && data.missing_view.db1.length > 0) {
                report += 'Missing in Database 1:\n';
                data.missing_view.db1.forEach(item => {
                    report += `- ${item.view_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
            
            if (data.missing_view.db2 && data.missing_view.db2.length > 0) {
                report += 'Missing in Database 2:\n';
                data.missing_view.db2.forEach(item => {
                    report += `- ${item.view_name}: ${item.message}\n`;
                    report += `  Query: ${item.query}\n\n`;
                });
            }
        }
        
        // Database Objects
        const objectTypes = [
            { key: 'missing_function', title: 'FUNCTIONS' },
            { key: 'missing_procedure', title: 'PROCEDURES' },
            { key: 'missing_event', title: 'EVENTS' },
            { key: 'missing_trigger', title: 'TRIGGERS' }
        ];
        
        objectTypes.forEach(objType => {
            if (data[objType.key]) {
                let hasIssues = false;
                let sectionContent = '';
                
                if (data[objType.key].db1 && data[objType.key].db1.length > 0) {
                    hasIssues = true;
                    sectionContent += 'Missing in Database 1:\n';
                    data[objType.key].db1.forEach(item => {
                        sectionContent += `- ${item.table_name}: ${item.message}\n`;
                        sectionContent += `  Query: ${item.query}\n\n`;
                    });
                }
                
                if (data[objType.key].db2 && data[objType.key].db2.length > 0) {
                    hasIssues = true;
                    sectionContent += 'Missing in Database 2:\n';
                    data[objType.key].db2.forEach(item => {
                        sectionContent += `- ${item.table_name}: ${item.message}\n`;
                        sectionContent += `  Query: ${item.query}\n\n`;
                    });
                }
                
                if (hasIssues) {
                    report += `${objType.title} ISSUES\n`;
                    report += '-'.repeat(20) + '\n';
                    report += sectionContent;
                }
            }
        });
        
        return report;
    }
});

// Global function for copying to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        // Show a temporary success message
        const originalText = event.target.innerHTML;
        event.target.innerHTML = '<i class="fas fa-check"></i> Copied!';
        event.target.style.background = '#d4edda';
        event.target.style.color = '#155724';
        
        setTimeout(() => {
            event.target.innerHTML = originalText;
            event.target.style.background = '';
            event.target.style.color = '';
        }, 2000);
    }).catch(function(err) {
        console.error('Could not copy text: ', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Show success message for fallback too
        const originalText = event.target.innerHTML;
        event.target.innerHTML = '<i class="fas fa-check"></i> Copied!';
        event.target.style.background = '#d4edda';
        event.target.style.color = '#155724';
        
        setTimeout(() => {
            event.target.innerHTML = originalText;
            event.target.style.background = '';
            event.target.style.color = '';
        }, 2000);
    });
} 
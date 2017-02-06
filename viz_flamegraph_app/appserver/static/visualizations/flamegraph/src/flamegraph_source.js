// Flamegraph visualization adapted for Splunk Modular visualization framework by Nicolas Dohrendorf released under Apache License Version 2.0
// Based on the D3.js Flamegraph adaptation by Martin Spier released under Apache License Version 2.0
// in turn based upon the original Flamegraph visualization by Brendan Gregg released under CDDL License 1.0
// See the README folder for the full license texts

define([
        'jquery',
        'underscore',
        'd3',
        'd3-tip',
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
        // Add required assets to this list
    ],
    function(
        $,
        _,
        d3,
        d3tooltip,
        SplunkVisualizationBase,
        vizUtils
    ) {

        // Definition of node class
        function Node(name, parentNode) {
            this.children = [];
            this.name = name;
            this.value = 0;
            this.parentNode = parentNode;
            this.depthCounter = 0;
            this.addValue = function(value) {
                this.value += parseInt(value);
                if (this.parentNode != null) {
                    this.parentNode.addValue(value);
                }
            };

            this.hasChildNamed = function(name) {
                for (var child = 0; child < this.children.length; child++) {
                    if (this.children[child].name == name) {
                        return this.children[child];
                    }
                }
                return null;
            };
        };

        // Extend from SplunkVisualizationBase
        return SplunkVisualizationBase.extend({

            initialize: function() {
                // Initialization logic
                SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
                this.$el = $(this.el);
                this.$el.addClass('d3-flame-graph');
                this.fg = null;
            },

            getInitialDataParams: function() {
                return ({
                    outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                    count: 10000
                });
            },

            // Optionally implement to format data returned from search. 
            // The returned object will be passed to updateView as 'data'
            formatData: function(data) {
                if (!data) return null;
                // Format data 
                var nested = new Node('Total', null);
                data.rows.forEach(function(row) {
                    var currentNode = nested; // reset current Node
                    
                    // iterate fields in row. Do not use foreach since abort is necessary on null fields
                    for(i=0; i < row.length; i++)
                    {
                    	var field = row[i];
                    	var treePos = currentNode.hasChildNamed(field);
                        if (treePos) 
                        {
                            currentNode = treePos;
                        }
                        else if(field != null & i < row.length - 1)
                        {
                            var depthCounter = 0;
                            var n = new Node(field, currentNode);
                            currentNode.children.push(n);
                            var itNode = n;
                            while(itNode.parentNode != null)
                            {
                                itNode = itNode.parentNode;
                                depthCounter++;
                                itNode.depthCounter = Math.max(itNode.depthCounter, depthCounter + 1);    // add one to depthCounter for root node
                            }
                            currentNode = n;
                        }
                        if ( field == null || i == row.length - 2 ) 
                        {
                            currentNode.addValue(row[row.length - 1]);
                            break;
                        } 
                    }	
                    
                });
                return nested;
            },

            // Reflow is called on resizing events
            reflow: function(){
                    this.invalidateUpdateView();
                    },

            // Implement updateView to render a visualization.
            //  'data' will be the data object returned from formatData or from the search
            //  'config' will be the configuration property object
            updateView: function(data, config) {
                // Set params
                this.$el.empty();
                var graphHeight = this.$el.height() - 40;
                var graphWidth = this.$el.width() - 40;
                var graphBaseColor = config[this.getPropertyNamespaceInfo().propertyNamespace + 'graphBaseColor'] || '#E600E6';
                var useCustomColorParam = config[this.getPropertyNamespaceInfo().propertyNamespace + 'useCustomColor'] || 'false';
                var useCustomColor = useCustomColorParam == 'true';
                var calcCellHeight = graphHeight / Math.max(data.depthCounter, 1);  

                var self = this.el;

                if(this.fg == null){
                    this.fg = flameGraph()
                }

                this.fg.height(graphHeight)
                    .width(graphWidth)
                    .cellHeight(calcCellHeight)
                    .transitionDuration(750)
                    .transitionEase('cubic-in-out')
                    .baseColor(graphBaseColor)
                    .useCustomColor(useCustomColor)
                    .sort(true)
                    .title("");
            
                d3.select(self)
                    .datum(data)
                    .call(this.fg);

                // Copied Code for flame graph
                function flameGraph() {
                    var w = 960, // graph width
                        h = 540, // graph height
                        c = 18, // cell height
                        selection = null, // selection
                        tooltip = true, // enable tooltip
                        title = "", // graph title
                        transitionDuration = 750,
                        transitionEase = "cubic-in-out", // tooltip offset
                        sort = true,
                        reversed = false, // reverse the graph direction
                        clickHandler = null,
                        color = "#E600E6",
                        useCustomColor = false;
                    
                    var tip = d3tooltip()
                        .direction("s")
                        .offset([8, 0])
                        .attr('class', 'd3-flame-graph-tip')
                        .html(function(d) {
                            return label(d); });


                    var labelFormat = function(d) {
                        return d.name + " (" + d3.round(100 * d.dx, 3) + "%, " + d.value + " samples)";
                    };

                    function setDetails(t) {
                        var details = document.getElementById("details");
                        if (details)
                            details.innerHTML = t;
                    }

                    function label(d) {
                        if (!d.dummy) {
                            return labelFormat(d);
                        } else {
                            return "";
                        }
                    }

                    function name(d) {
                        return d.name;
                    }

                    var colorMapper = function(d) {
                        if(!useCustomColor)
                            return d.highlight ? color : colorHash(d.name);
                        return d.highlight ? color : customColorHash(d.name);
                    };

                    function generateHash(name) {
                        // Return a vector (0.0->1.0) that is a hash of the input string.
                        // The hash is computed to favor early characters over later ones, so
                        // that strings with similar starts have similar vectors. Only the first
                        // 6 characters are considered.
                        var hash = 0,
                            weight = 1,
                            max_hash = 0,
                            mod = 10,
                            max_char = 6;
                        if (name) {
                            for (var i = 0; i < name.length; i++) {
                                if (i > max_char) {
                                    break; }
                                hash += weight * (name.charCodeAt(i) % mod);
                                max_hash += weight * (mod - 1);
                                weight *= 0.70;
                            }
                            if (max_hash > 0) { hash = hash / max_hash; }
                        }
                        return hash;
                    }

                    function colorHash(name) {
                      // Return an rgb() color string that is a hash of the provided name,
                      // and with a warm palette.
                      var vector = 0;
                      if (name) {
                        name = name.replace(/.*`/, "");     // drop module name if present
                        name = name.replace(/\(.*/, "");    // drop extra info
                        vector = generateHash(name);
                      }
                      var r = 200 + Math.round(55 * vector);
                      var g = 0 + Math.round(230 * (1 - vector));
                      var b = 0 + Math.round(55 * (1 - vector));
                      return "rgb(" + r + "," + g + "," + b + ")";
                    }

                    function customColorHash(name) {
                        // Return an rgb() color string that is a hash of the provided name,
                        // and with a custom color palette.
                        var vector = 0;
                        if (name) {
                            name = name.replace(/.*`/, ""); // drop module name if present
                            name = name.replace(/\(.*/, ""); // drop extra info
                            vector = generateHash(name);
                        }
                        var rOff = parseInt('0x' + color.substr(1,2));
                        var gOff = parseInt('0x' + color.substr(3,2));
                        var bOff = parseInt('0x' + color.substr(5,2));

                        var r = rOff + Math.round((255 - rOff) * vector);
                        var g = gOff + Math.round((255 - gOff) * vector);
                        var b = bOff + Math.round((255 - bOff) * vector);
                        return "rgb(" + r + "," + g + "," + b + ")";
                    }

                    function augment(data) {
                        // Augment partitioning layout with "dummy" nodes so that internal nodes'
                        // values dictate their width. Annoying, but seems to be least painful
                        // option.  https://github.com/mbostock/d3/pull/574
                        if (data.children && (data.children.length > 0)) {
                            data.children.forEach(augment);
                            var childValues = 0;
                            data.children.forEach(function(child) {
                                childValues += child.value;
                            });
                            if (childValues < data.value) {
                                data.children.push({
                                    "name": "",
                                    "value": data.value - childValues,
                                    "dummy": true
                                });
                            }
                        }
                    }

                    function hide(d) {
                        if (!d.original) {
                            d.original = d.value;
                        }
                        d.value = 0;
                        if (d.children) {
                            d.children.forEach(hide);
                        }
                    }

                    function show(d) {
                        d.fade = false;
                        if (d.original) {
                            d.value = d.original;
                        }
                        if (d.children) {
                            d.children.forEach(show);
                        }
                    }

                    function getSiblings(d) {
                        var siblings = [];
                        if (d.parent) {
                            var me = d.parent.children.indexOf(d);
                            siblings = d.parent.children.slice(0);
                            siblings.splice(me, 1);
                        }
                        return siblings;
                    }

                    function hideSiblings(d) {
                        var siblings = getSiblings(d);
                        siblings.forEach(function(s) {
                            hide(s);
                        });
                        if (d.parent) {
                            hideSiblings(d.parent);
                        }
                    }

                    function fadeAncestors(d) {
                        if (d.parent) {
                            d.parent.fade = true;
                            fadeAncestors(d.parent);
                        }
                    }

                    function getRoot(d) {
                        if (d.parent) {
                            return getRoot(d.parent);
                        }
                        return d;
                    }

                    function zoom(d) {
                        tip.hide(d);
                        hideSiblings(d);
                        show(d);
                        fadeAncestors(d);
                        update();
                        if (typeof clickHandler === 'function') {
                            clickHandler(d);
                        }
                    }

                    function searchTree(d, term) {
                        var re = new RegExp(term),
                            searchResults = [];

                        function searchInner(d) {
                            var label = d.name;

                            if (d.children) {
                                d.children.forEach(function(child) {
                                    searchInner(child);
                                });
                            }

                            if (label.match(re)) {
                                d.highlight = true;
                                searchResults.push(d);
                            } else {
                                d.highlight = false;
                            }
                        }

                        searchInner(d);
                        return searchResults;
                    }

                    function clear(d) {
                        d.highlight = false;
                        if (d.children) {
                            d.children.forEach(function(child) {
                                clear(child);
                            });
                        }
                    }

                    function doSort(a, b) {
                        if (typeof sort === 'function') {
                            return sort(a, b);
                        } else if (sort) {
                            return d3.ascending(a.name, b.name);
                        } else {
                            return 0;
                        }
                    }

                    var partition = d3.layout.partition()
                        .sort(doSort)
                        .value(function(d) {
                            return d.v || d.value; })
                        .children(function(d) {
                            return d.c || d.children; });

                    function update() {

                        selection.each(function(data) {

                            var x = d3.scale.linear().range([0, w]),
                                y = d3.scale.linear().range([0, c]);

                            var nodes = partition(data);

                            var kx = w / data.dx;
                            var g = d3.select(this).select("svg").selectAll("g").data(nodes);

                            g.transition()
                                .duration(transitionDuration)
                                .ease(transitionEase)
                                .attr("transform", function(d) {
                                    return "translate(" + x(d.x) + "," + (reversed ? y(d.depth) : (h - y(d.depth) - c)) + ")";
                                });

                            g.select("rect").transition()
                                .duration(transitionDuration)
                                .ease(transitionEase)
                                .attr("width", function(d) {
                                    return d.dx * kx; });

                            var node = g.enter()
                                .append("svg:g")
                                .attr("transform", function(d) {
                                    return "translate(" + x(d.x) + "," + (reversed ? y(d.depth) : (h - y(d.depth) - c)) + ")";
                                });

                            node.append("svg:rect")
                                .attr("width", function(d) {
                                    return d.dx * kx; });

                            if (!tooltip)
                                node.append("svg:title");

                            node.append("foreignObject")
                                .append("xhtml:div");

                            g.attr("width", function(d) {
                                    return d.dx * kx; })
                                .attr("height", function(d) {
                                    return c; })
                                .attr("name", function(d) {
                                    return d.name; })
                                .attr("class", function(d) {
                                    return d.fade ? "frame fade" : "frame"; });

                            g.select("rect")
                                .attr("height", function(d) {
                                    return c; })
                                .attr("fill", function(d) {
                                    return colorMapper(d); })
                                .style("visibility", function(d) {
                                    return d.dummy ? "hidden" : "visible"; });

                            if (!tooltip)
                                g.select("title")
                                .text(label);

                            g.select("foreignObject")
                                .attr("width", function(d) {
                                    return d.dx * kx; })
                                .attr("height", function(d) {
                                    return c; })
                                .select("div")
                                .attr("class", "flamegraph-label")
                                .style("display", function(d) {
                                    return (d.dx * kx < 35) || d.dummy ? "none" : "block"; })
                                .text(name);

                            g.on('click', zoom);

                            g.exit().remove();

                            g.on('mouseover', function(d) {
                                if (!d.dummy) {
                                    if (tooltip) tip.show(d);
                                    setDetails(label(d));
                                }
                            }).on('mouseout', function(d) {
                                if (!d.dummy) {
                                    if (tooltip) tip.hide(d);
                                    setDetails("");
                                }
                            });
                        });
                    }

                    function merge(data, samples) {
                        samples.forEach(function(sample) {
                            var node = _.find(data, function(element) {
                                return element.name === sample.name;
                            });

                            if (node) {
                                node.value += sample.value;
                                if (sample.children) {
                                    if (!node.children) {
                                        node.children = [];
                                    }
                                    merge(node.children, sample.children)
                                }
                            } else {
                                data.push(sample);
                            }
                        });
                    }

                    function chart(s) {

                        selection = s;

                        if (!arguments.length) return chart;

                        selection.each(function(data) {

                            var svg = d3.select(this)
                                .append("svg:svg")
                                .attr("width", w)
                                .attr("height", h)
                                .attr("class", "partition d3-flame-graph")
                                .call(tip);

                            svg.append("svg:text")
                                .attr("class", "title")
                                .attr("text-anchor", "middle")
                                .attr("y", "25")
                                .attr("x", w / 2)
                                .attr("fill", "#808080")
                                .text(title);

                            augment(data);

                            // "creative" fix for node ordering when partition is called for the first time
                            partition(data);

                        });

                        // first draw
                        update();
                    }

                    chart.baseColor = function(_) {
                        if (!arguments.length) {
                            return color; }
                        color = _;
                        return chart;
                    };

                    chart.useCustomColor = function(_) {
                        if (!arguments.length) {
                            return useCustomColor; }
                        useCustomColor = _;
                        return chart;
                    };

                    chart.height = function(_) {
                        if (!arguments.length) {
                            return h; }
                        h = _;
                        return chart;
                    };

                    chart.width = function(_) {
                        if (!arguments.length) {
                            return w; }
                        w = _;
                        return chart;
                    };

                    chart.cellHeight = function(_) {
                        if (!arguments.length) {
                            return c; }
                        c = _;
                        return chart;
                    };

                    chart.tooltip = function(_) {
                        if (!arguments.length) {
                            return tooltip; }
                        if (typeof _ === "function") {
                            tip = _;
                        }
                        tooltip = true;
                        return chart;
                    };

                    chart.title = function(_) {
                        if (!arguments.length) {
                            return title; }
                        title = _;
                        return chart;
                    };

                    chart.transitionDuration = function(_) {
                        if (!arguments.length) {
                            return transitionDuration; }
                        transitionDuration = _;
                        return chart;
                    };

                    chart.transitionEase = function(_) {
                        if (!arguments.length) {
                            return transitionEase; }
                        transitionEase = _;
                        return chart;
                    };

                    chart.sort = function(_) {
                        if (!arguments.length) {
                            return sort; }
                        sort = _;
                        return chart;
                    };

                    chart.reversed = function(_) {
                        if (!arguments.length) {
                            return reversed; }
                        reversed = _;
                        return chart;
                    };

                    chart.label = function(_) {
                        if (!arguments.length) {
                            return labelFormat; }
                        labelFormat = _;
                        return chart;
                    };

                    chart.search = function(term) {
                        var searchResults = [];
                        selection.each(function(data) {
                            searchResults = searchTree(data, term);
                            update();
                        });
                        return searchResults;
                    };

                    chart.clear = function() {
                        selection.each(function(data) {
                            clear(data);
                            update();
                        });
                    };

                    chart.zoomTo = function(d) {
                        zoom(d);
                    };

                    chart.resetZoom = function() {
                        selection.each(function(data) {
                            zoom(data); // zoom to root
                        });
                    };

                    chart.onClick = function(_) {
                        if (!arguments.length) {
                            return clickHandler;
                        }
                        clickHandler = _;
                        return chart;
                    };

                    chart.merge = function(samples) {
                        selection.each(function(data) {
                            merge([data], [samples]);
                            augment(data);
                        });
                        update();
                    }

                    chart.color = function(_) {
                        if (!arguments.length) {
                            return colorMapper; }
                        colorMapper = _;
                        return chart;
                    };

                    return chart;
                }

            },

            // Search data params
            getInitialDataParams: function() {
                return ({
                    outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                    count: 10000
                });
            }

        });
    });

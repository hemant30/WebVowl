//var _ = require('lodash');
import { VowlMath } from './util/math';
import { LinkCreator } from './parsing/linkCreator';
import { ElementTools } from './util/elementTools';


import { IVowl } from '.././model/vowl.interface'
import { Options } from './options';

import { Parser } from './parser';

import { Focuser } from './modules/focuser'
import { DatatypeFilter } from './modules/datatypeFilter'

export class Graph {

    public CARDINALITY_HDISTANCE: number = 20
    public CARDINALITY_VDISTANCE: number = 10;

    public graphContainer: d3.Selection<any>;
    public nodeContainer: d3.Selection<any>;
    public labelContainer: d3.Selection<any>;
    public cardinalityContainer: d3.Selection<any>;
    public linkContainer: d3.Selection<any>;
    // public nodeElements;
    public labelGroupElements: d3.Selection<any>;
    public linkGroups: d3.Selection<any>;
    public linkPathElements: d3.Selection<any>;
    public cardinalityElements: d3.Selection<any>;

    // public classNodes;
    // public labelNodes;
    // public links;
    // public properties;
    // public unfilteredData;

    public d3;
    public force;
    public dragBehaviour: d3.behavior.Drag<any>;
    public zoom;

    public paused: boolean;
    //private parser: Parser;
    options;

    constructor(private graphContainerSelector: string, private owldata) {
        this.paused = false;
        Options.data = owldata;
        this.options = Options;
        // this.parser = new Parser(this);
        // this.math = Math;

        this.initializeModules();
        this.initializeGraph();

    }

    private initializeModules() {
        Options.selectionModules.push(Focuser);
        Options.filterModules.push(DatatypeFilter);
    }


    private curveFunction = d3.svg.line().x(function (d: any) { return d.x; }).y(function (d: any) { return d.y }).interpolate("cardinal");

    private recalculatePositions = () => {
        let _self = this;
        // Set node positions
        Options.nodeElements.attr("transform", function (node) {
            return "translate(" + node.x + "," + node.y + ")";
        });

        // Set label group positions
        this.labelGroupElements.attr("transform", function (label) {
            let position;

            // force centered positions on single-layered links
            var link = label.link;
            if (link.layers.length === 1 && !link.loops) {
                var linkDomainIntersection = VowlMath.calculateIntersection(link.range, link.domain, 0);
                var linkRangeIntersection = VowlMath.calculateIntersection(link.domain, link.range, 0);
                position = VowlMath.calculateCenter(linkDomainIntersection, linkRangeIntersection);
                label.x = position.x;
                label.y = position.y;
            } else {
                position = label;
            }

            return "translate(" + position.x + "," + position.y + ")";
        });

        // Set link paths and calculate additional informations
        this.linkPathElements.attr("d", function (l) {
            if (l.isLoop()) {
                return VowlMath.calculateLoopPath(l);
            }

            var curvePoint = l.label;
            var pathStart = VowlMath.calculateIntersection(curvePoint, l.domain, 1);
            var pathEnd = VowlMath.calculateIntersection(curvePoint, l.range, 1);

            return _self.curveFunction([pathStart, curvePoint, pathEnd]);
        });

        // Set cardinality positions
        this.cardinalityElements.attr("transform", function (property) {
            let label = property.link.label;
            let pos = VowlMath.calculateIntersection(label, property.range, _self.CARDINALITY_HDISTANCE);
            let normalV = VowlMath.calculateNormalVector(label, property.domain, _self.CARDINALITY_VDISTANCE);

            return "translate(" + (pos.x + normalV.x) + "," + (pos.y + normalV.y) + ")";
        });
    }

    /**
	 * Adjusts the containers current scale and position.
	 */
    private zoomed = () => {
        this.graphContainer.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }

    /**
	 * Initializes the graph.
	 */
    private initializeGraph = () => {

        Options.graphContainerSelector = this.graphContainerSelector;
        let _self = this;

        // d3.selectAll(Options.graphContainerSelector)
        //     .append("svg")
        //     .classed("vowlGraph", true)
        //     .attr("width", Options.width)
        //     .attr("height", Options.height)
        //     .call(_self.zoom)
        //     .append("g");

        this.force = d3.layout.force()
            .charge(Options.charge)
            .gravity(Options.gravity)
            .linkStrength(0.7)
            .size([Options.width, Options.height])
            .on("tick", _self.recalculatePositions);
        // .start();

        this.dragBehaviour = d3.behavior.drag()
            .origin(function (d: any) {
                return d;
            })
            .on("dragstart", function (d: any) {
                d3.event.sourceEvent.stopPropagation(); // Prevent panning
                d.locked = true;
            })
            .on("drag", function (d: any) {
                d.px = d3.event.x;
                d.py = d3.event.y;
                _self.force.resume();
            })
            .on("dragend", function (d: any) {
                d.locked = false;
            });

        // Apply the zooming factor.
        this.zoom = d3.behavior.zoom()
            // .duration(150)
            .scaleExtent([Options.minMagnification, Options.maxMagnification])
            .on("zoom", this.zoomed);

    }

    private redrawGraph = () => {
        let _self = this;
        this.remove();

        this.graphContainer = d3.selectAll(Options.graphContainerSelector)
            .append("svg")
            .classed("vowlGraph", true)
            .attr("width", Options.width)
            .attr("height", Options.height)
            .call(_self.zoom)
            .append("g");

    }

    /**
	 * Redraws all elements like nodes, links, ...
	 */
    private redrawContent = () => {
        let _self = this;

        if (!this.graphContainer) {
            return;
        }

        // Empty the graph container
        this.graphContainer.selectAll("*").remove();

        // Last container -> elements of this container overlap others
        this.linkContainer = this.graphContainer.append("g").classed("linkContainer", true);
        this.cardinalityContainer = this.graphContainer.append("g").classed("cardinalityContainer", true);
        this.labelContainer = this.graphContainer.append("g").classed("labelContainer", true);
        this.nodeContainer = this.graphContainer.append("g").classed("nodeContainer", true);

        // Add an extra container for all markers
        let markerContainer = this.linkContainer.append("defs");

        // Draw nodes
        Options.nodeElements = this.nodeContainer.selectAll(".node")
            .data(Options.classNodes).enter()
            .append("g")
            .classed("node", true)
            .attr("id", function (d: any) {
                return d.id;
            })
            .call(_self.dragBehaviour);

        Options.nodeElements.each(function (node) {
            node.draw(d3.select(this));
        });

        // Draw label groups (property + inverse)
        this.labelGroupElements = this.labelContainer.selectAll(".labelGroup")
            .data(Options.labelNodes).enter()
            .append("g")
            .classed("labelGroup", true)
            .call(_self.dragBehaviour);

        this.labelGroupElements.each(function (label) {
            var success = label.draw(d3.select(this));
            // Remove empty groups without a label.
            if (!success) {
                d3.select(this).remove();
            }
        });

        // Place subclass label groups on the bottom of all labels
        this.labelGroupElements.each(function (label) {
            // the label might be hidden e.g. in compact notation
            if (!this.parentNode) {
                return;
            }

            if (ElementTools.isRdfsSubClassOf(label.property)) {
                var parentNode = this.parentNode;
                parentNode.insertBefore(this, parentNode.firstChild);
            }
        });

        // Draw cardinalities
        this.cardinalityElements = this.cardinalityContainer.selectAll(".cardinality")
            .data(Options.properties).enter()
            .append("g")
            .classed("cardinality", true);

        this.cardinalityElements.each(function (property) {
            var success = property.drawCardinality(d3.select(this));

            // Remove empty groups without a label.
            if (!success) {
                d3.select(this).remove();
            }
        });

        // Draw links
        this.linkGroups = this.linkContainer.selectAll(".link")
            .data(Options.links).enter()
            .append("g")
            .classed("link", true);

        this.linkGroups.each(function (link) {
            link.draw(d3.select(this), markerContainer);
        });

        // Select the path for direct access to receive a better performance
        this.linkPathElements = this.linkGroups.selectAll("path");

        this.addClickEvents();
    }

    private addClickEvents = () => {
        let executeModules = (clickedNode) => {
            Options.selectionModules.forEach(function (module) {
                module.handle(clickedNode);
            });
        }

        Options.nodeElements.on("click", function (clickedNode) {
            executeModules(clickedNode);
        });

        this.labelGroupElements.selectAll(".label").on("click", function (clickedProperty) {
            executeModules(clickedProperty);
        });
    }

    private loadGraphData = () => {
        let _self = this;
        Parser.parse(Options.data, this);
        Options.unfilteredData = {
            nodes: Parser.nodes,
            properties: Parser.properties
        };

        // Initialize filters with data to replicate consecutive filtering
        var initializationData = _.clone(Options.unfilteredData);
        Options.filterModules.forEach(function (module) {
            initializationData = _self.filterFunction(module, initializationData, true);
        });
    }

    private refreshGraphData = () => {
        let _self = this;
        var preprocessedData = _.clone(Options.unfilteredData);

        // Filter the data
        Options.filterModules.forEach(function (module) {
            preprocessedData = _self.filterFunction(module, preprocessedData);
        });

        Options.classNodes = preprocessedData.nodes;
        Options.properties = preprocessedData.properties;
        Options.links = LinkCreator.createLinks(Options.properties);
        Options.labelNodes = Options.links.map(function (link) {
            return link.label;
        });
        this.storeLinksOnNodes(Options.classNodes, Options.links);

        this.setForceLayoutData(Options.classNodes, Options.labelNodes, Options.links);
    }

    private filterFunction(module, data, initializing?) {
        Options.links = LinkCreator.createLinks(data.properties);
        this.storeLinksOnNodes(data.nodes, Options.links);

        if (initializing) {
            if (module.initialize) {
                module.initialize(data.nodes, data.properties);
            }
        }
        module.filter(data.nodes, data.properties);
        return {
            nodes: module.filteredNodes,
            properties: module.filteredProperties
        };
    }

    private storeLinksOnNodes(nodes, links) {
        for (var i = 0, nodesLength = nodes.length; i < nodesLength; i++) {
            var node = nodes[i],
                connectedLinks = [];

            // look for properties where this node is the domain or range
            for (var j = 0, linksLength = links.length; j < linksLength; j++) {
                var link = links[j];

                if (link.domain === node || link.range === node) {
                    connectedLinks.push(link);
                }
            }

            node.links = connectedLinks;
        }
    }

    private setForceLayoutData(classNodes, labelNodes, links) {
        let d3Links = [];
        links.forEach(function (link) {
            d3Links = d3Links.concat(link.linkparts);
        });

        let d3Nodes = [].concat(classNodes).concat(labelNodes);
        this.setPositionOfOldLabelsOnNewLabels(this.force.nodes(), labelNodes);

        this.force.nodes(d3Nodes)
            .links(d3Links);
    }

    /**
	 * The label nodes are positioned randomly, because they are created from scratch if the data changes and lose
	 * their position information. With this hack the position of old labels is copied to the new labels.
	 */
    private setPositionOfOldLabelsOnNewLabels(oldLabelNodes, labelNodes) {
        labelNodes.forEach(function (labelNode) {
            for (var i = 0; i < oldLabelNodes.length; i++) {
                var oldNode = oldLabelNodes[i];
                if (oldNode.equals(labelNode)) {
                    labelNode.x = oldNode.x;
                    labelNode.y = oldNode.y;
                    break;
                }
            }
        });
    }

    private refreshGraphStyle = () => {
        let _self = this;
        this.zoom = this.zoom.scaleExtent([Options.minMagnification, Options.maxMagnification]);
        if (this.graphContainer) {
            this.zoom.event(this.graphContainer);
        }

        this.force.charge(function (element) {
            var charge = Options.charge;
            if (ElementTools.isLabel(element)) {
                charge *= 0.8;
            }
            return charge;
        })
            .size([Options.width, Options.height])
            .linkDistance(_self.calculateLinkPartDistance)
            .gravity(Options.gravity)
            .linkStrength(Options.linkStrength); // Flexibility of links

        this.force.nodes().forEach(function (n) {
            n.frozen = false;
        });
    }

    private remove = () => {
        if (this.graphContainer) {
            // Select the parent element because the graph container is a group (e.g. for zooming)
            d3.select(this.graphContainer.node().parentNode).remove();
        }
    }

    private calculateLinkPartDistance = (linkPart) => {
        var link = linkPart.link;
        if (link.isLoop()) {
            return Options.loopDistance;
        }

        // divide by 2 to receive the length for a single link part
        var linkPartDistance = this.getVisibleLinkDistance(link) / 2;
        linkPartDistance += linkPart.domain.actualRadius();
        linkPartDistance += linkPart.range.actualRadius();
        return linkPartDistance;
    }

    private getVisibleLinkDistance = (link): number => {
        if (ElementTools.isDatatype(link.domain) || ElementTools.isDatatype(link.range)) {
            return Options.datatypeDistance;
        } else {
            return Options.classDistance;
        }
    }

    /**
 * Loads all settings, removes the old graph (if it exists) and draws a new one.
 */
    start = () => {
        this.force.stop();
        this.loadGraphData();
        this.redrawGraph();
        this.update();
    }
    reset = () => {
        this.zoom.translate([0, 0])
            .scale(1);
    }

    update = () => {
        this.refreshGraphData();
        this.refreshGraphStyle();
        this.force.start();
        this.redrawContent();
    }
    reload = () => {
        this.loadGraphData();
        this.update();
    }
    updateStyle = () => {
        this.refreshGraphStyle();
        this.force.start();
    }
}
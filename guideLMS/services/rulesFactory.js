'use strict';

const Alert = require("../models/Alert");
const Group = require('../models/Group');
const RulesRepository = require('../storage/rulesRepository');
const AttributeConceptsRepository = require('../storage/attributeConceptsRepository');
const AttributeRule = require('../models/attributeRule');
const MoveRule = require('../models/moveRule');
const BreedingRule = require('../models/breedingRule');
const ParentChangedRule = require('../models/parentChangedRule');
const ChallengeConceptsRepository = require('../storage/challengeConceptsRepository');
const ChallengeRule = require('../models/challengeRule');

/**
 * This class creates rules of specific types
 */
class RulesFactory {
    constructor() {
        this.attributeConcepts = null;
        this._rules = [];
    }

    createRulesForEventAsync(session, event) {

        let speciesName = event.context.species;

        // This workaround should be removed in the future - rgtaylor 2018-08-24
        // Default to Drake is not defined
        if (speciesName == undefined || speciesName == null) {
            speciesName = "Drake";
            event.context.species = speciesName;
            // TODO throw an error when this is eventually fixed in Geniventure
            //throw new Error("Event does not contain context.species property");
        }

        BiologicaX.fixIncomingEvent(event);

        let groupName = session.groupId;
        this._populatePreviousProperty(session, event);
        return this._loadAttributeConceptsAsync(session, groupName, speciesName)
            .then(() => this._loadEventRulesAsync(event, speciesName))
            .then(() => this._createChallengeIdRulesAsync(session, session.groupId))
            .then(() => this._rules);
    }



    _loadEventRulesAsync(event, speciesName) {

        if (event.isMatch('USER', 'SUBMITTED', 'ORGANISM')
         || event.isMatch('USER', 'SUBMITTED', 'EGG')) {
            return this._createOrganismMatchRules();

        } else if (event.isMatch('USER', 'CHANGED', 'ALLELE')) {
            return this._createOrganismChangedRules();

        } else if (event.isMatch('USER', 'BRED', 'CLUTCH')
                || event.isMatch('USER', 'SUBMITTED', 'PARENTS')) {
            return this._createBreedingRules();

        } else if (event.isMatch('USER', 'CHANGED', 'PARENT')) {
            return this._createParentChangedRules();

        } else {
            return Promise.resolve();

        }
    }

    _populatePreviousProperty(session, event) {
        // Create previous property
        if (!event.context.hasOwnProperty("previous") 
            || event.isMatch('*', 'SUBMITTED', '*')
            || event.isMatch('*', 'BRED', '*')) {
            let previousEvent = session.findPreviousEvent(event);
            if (previousEvent != null && previousEvent.context.hasOwnProperty("selected")) {
                event.context.previous = Object.assign(previousEvent.context.selected, {});
                console.log("Add previous to event: " + JSON.stringify(event.context.previous, null, '\t'));
            }
        }
    }

    _loadAttributeConceptsAsync(session, groupName, speciesName) {
        if (this.attributeConcepts != null) {
            return Promise.accept();
        } else {
            let attributeConceptsRepository;
            return Group.findOne({ "name": groupName }).then((group) => {
                if (!group) {
                    throw new Error("Unable to find group with name: " + groupName);
                }

                let tags = speciesName.toLowerCase() + ", attribute-concepts";
                let ids = group.getCollectionIds(tags);

                if (ids.length == 0) {
                    Alert.warning("Unable to find attribute concepts sheet for [" + tags + "] defined in '" + groupName + "' group", session);
                }

                attributeConceptsRepository = new AttributeConceptsRepository(global.cacheDirectory);
                return attributeConceptsRepository.loadCollectionsAsync(ids, group.cacheDisabled);
            }).then(() => {
                if (attributeConceptsRepository) {
                    this.attributeConcepts = attributeConceptsRepository.objs;
                }
            })
        }
    }

    _loadRulesFromSheetAsync(session, groupName, tags) {
        let rulesRepository = new RulesRepository(global.cacheDirectory);
        return Group.findOne({ "name": groupName }).then((group) => {
            if (!group) {
                throw new Error("Unable to find group with name: " + groupName);
            }

            let ids = group.getCollectionIds(tags);

            this.ruleSourceUrls = ids.map((id) => {
                return rulesRepository.getGoogleSheetUrl(id);
            });

            if (ids.length == 0) {
                Alert.warning("No rules sheets specified for [" + tags + "] in '" + groupName + "' group.", session);
            }

            return rulesRepository.loadCollectionsAsync(ids, group.cacheDisabled);
        })
        .then(() => rulesRepository.objs);
    }

    _createChallengeIdRulesAsync(session, groupName) {
        let challengeConceptsRepository;
        return Group.findOne({ "name": groupName }).then((group) => {
            if (!group) {
                throw new Error("Unable to find group with name: " + groupName);
            }

            let tags = "challenge-concepts";
            let ids = group.getCollectionIds(tags);

            if (ids.length == 0) {
                Alert.warning("Unable to find challenge concepts sheet for [" + tags + "] defined in '" + groupName + "' group", session);
            }

            challengeConceptsRepository = new ChallengeConceptsRepository(global.cacheDirectory);
            return challengeConceptsRepository.loadCollectionsAsync(ids, group.cacheDisabled);
        }).then(() => {
            if (challengeConceptsRepository) {

                for(let challengeConcept of challengeConceptsRepository.objs) {
                    let rule = new ChallengeRule(
                        challengeConcept.challengeId,
                        challengeConcept);

                    this._rules.push(rule);
                }
            }
        });
    }

    _createOrganismMatchRules() {
        let attributes = [...new Set(this.attributeConcepts.map(item => item.attribute))];

        for(let attribute of attributes) {
            let targets = this.attributeConcepts.filter((item) => item.attribute === attribute);
            var targetMap = {};
            for(let target of targets) {
                targetMap[target.target] = target;
            }

            let rule = new AttributeRule(
                attribute,
                targetMap);

            this._rules.push(rule);
        }
    }

    _createBreedingRules() {
        let attributes = [...new Set(this.attributeConcepts.map(item => item.attribute))];

        for(let attribute of attributes) {
            let targets = this.attributeConcepts.filter((item) => item.attribute === attribute);
            var targetMap = {};
            for(let target of targets) {
                targetMap[target.target] = target;
            }

            let rule = new BreedingRule(
                attribute,
                targetMap);

            this._rules.push(rule);
        }
    }

    _createOrganismChangedRules() {
        let attributes = [...new Set(this.attributeConcepts.map(item => item.attribute))];

        for(let attribute of attributes) {
            let targets = this.attributeConcepts.filter((item) => item.attribute === attribute);
            var targetMap = {};
            for(let target of targets) {
                targetMap[target.target] = target;
            }

            let rule = new MoveRule(
                attribute,
                targetMap);

            this._rules.push(rule);
        }
    }

    _createParentChangedRules() {
        let attributes = [...new Set(this.attributeConcepts.map(item => item.attribute))];

        for(let attribute of attributes) {
            let targets = this.attributeConcepts.filter((item) => item.attribute === attribute);
            var targetMap = {};
            for(let target of targets) {
                targetMap[target.target] = target;
            }

            let rule = new ParentChangedRule(
                attribute,
                targetMap);

            this._rules.push(rule);
        }
    }
}

module.exports = RulesFactory;
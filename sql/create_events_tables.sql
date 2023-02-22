DROP TABLE IF EXISTS `dex_history`;
CREATE TABLE `dex_history` (
  `hash` varchar(64) NOT NULL,
  `action` varchar(45) NOT NULL,
  `pool_id` varchar(130) DEFAULT NULL,
  `block_n` varchar(45) NOT NULL,
  `block_time` bigint(11) DEFAULT NULL,
  `caller` varchar(66) DEFAULT NULL,
  `v1_at` varchar(45) DEFAULT NULL,
  `v2_at` varchar(45) DEFAULT NULL,
  `tvl1` varchar(45) DEFAULT NULL,
  `tvl2` varchar(45) DEFAULT NULL,
  `lt_change` varchar(45) DEFAULT NULL,
  `i` bigint(11) NOT NULL AUTO_INCREMENT,
  `prev` bigint(11) DEFAULT NULL,
  `v1_change` varchar(45) DEFAULT NULL,
  `v2_change` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`i`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1;

DROP TABLE IF EXISTS `events`;
CREATE TABLE `events` (
  `type` varchar(45) DEFAULT NULL,
  `hash` varchar(64) DEFAULT NULL,
  `time` bigint(11) DEFAULT NULL,
  `n` bigint(11) DEFAULT NULL,
  `data` varchar(500) DEFAULT NULL,
  `i` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`i`)
) ENGINE=InnoDB AUTO_INCREMENT=0 DEFAULT CHARSET=latin1;

INSERT INTO `stat` VALUES ('update_dex_info','0',NULL,15);
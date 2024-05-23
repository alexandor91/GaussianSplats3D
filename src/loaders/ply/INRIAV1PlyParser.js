import * as THREE from 'three';
import { clamp } from '../../Util.js';
import { UncompressedSplatArray } from '../UncompressedSplatArray.js';
import { SplatBuffer } from '../SplatBuffer.js';
import { getSphericalHarmonicsComponentCountForDegree } from '../../Util.js';
import { PlyParserUtils } from './PlyParserUtils.js';

const FieldNamesToRead = ['scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
                          'x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'red', 'green', 'blue',
                          'f_rest_0', 'f_rest_1', 'f_rest_2', 'f_rest_15', 'f_rest_16', 'f_rest_17', 'f_rest_30', 'f_rest_31', 'f_rest_32',
                          'f_rest_3', 'f_rest_4', 'f_rest_5', 'f_rest_6', 'f_rest_7',
                          'f_rest_18', 'f_rest_19', 'f_rest_20', 'f_rest_21', 'f_rest_22',
                          'f_rest_33', 'f_rest_34', 'f_rest_35', 'f_rest_36', 'f_rest_37'];

const FieldsToReadIndexes = FieldNamesToRead.map((e, i) => i);

const [
        SCALE_0, SCALE_1, SCALE_2, ROT_0, ROT_1, ROT_2, ROT_3, X, Y, Z, F_DC_0, F_DC_1, F_DC_2, OPACITY, RED, GREEN, BLUE, F_REST_0
      ] = FieldsToReadIndexes;

export class INRIAV1PlyParser {

    constructor() {
        this.plyParserutils = new PlyParserUtils();
    }

    decodeHeaderLines(headerLines) {
        const fieldNameIdMap = FieldsToReadIndexes.reduce((acc, element) => {
            acc[FieldNamesToRead[element]] = element;
            return acc;
        }, {});
        const header = this.plyParserutils.decodeSectionHeader(headerLines, fieldNameIdMap, 0);
        header.splatCount = header.vertexCount;
        header.bytesPerSplat = header.bytesPerVertex;
        return header;
    }

    decodeHeaderText(headerText) {
        const headerLines = PlyParserUtils.convertHeaderTextToLines(headerText);
        const header = this.decodeHeaderLines(headerLines);
        header.headerText = headerText;
        header.headerSizeBytes = headerText.indexOf(PlyParserUtils.HeaderEndToken) + PlyParserUtils.HeaderEndToken.length + 1;
        return header;
    }

    decodeHeaderFromBuffer(plyBuffer) {
        const headerText = this.plyParserutils.readHeaderFromBuffer(plyBuffer);
        return this.decodeHeaderText(headerText);
    }

    findSplatData(plyBuffer, header) {
        return new DataView(plyBuffer, header.headerSizeBytes);
    }

    parseToUncompressedSplatBufferSection(header, fromSplat, toSplat, splatData, splatDataOffset,
                                                 toBuffer, toOffset, outSphericalHarmonicsDegree = 0) {
        outSphericalHarmonicsDegree = Math.min(outSphericalHarmonicsDegree, header.sphericalHarmonicsDegree);
        const sphericalHarmonicsCount = getSphericalHarmonicsComponentCountForDegree(outSphericalHarmonicsDegree);
        const outBytesPerCenter = SplatBuffer.CompressionLevels[0].BytesPerCenter;
        const outBytesPerScale = SplatBuffer.CompressionLevels[0].BytesPerScale;
        const outBytesPerRotation = SplatBuffer.CompressionLevels[0].BytesPerRotation;
        const outBytesPerColor = SplatBuffer.CompressionLevels[0].BytesPerColor;
        const outBytesPerSplat = SplatBuffer.CompressionLevels[0].SphericalHarmonicsDegrees[outSphericalHarmonicsDegree].BytesPerSplat;

        for (let i = fromSplat; i <= toSplat; i++) {

            const parsedSplat = INRIAV1PlyParser.parseToUncompressedSplat(splatData, i, header,
                                                                          splatDataOffset, outSphericalHarmonicsDegree);

            const outBase = i * outBytesPerSplat + toOffset;
            const outCenter = new Float32Array(toBuffer, outBase, 3);
            const outScale = new Float32Array(toBuffer, outBase + outBytesPerCenter, 3);
            const outRotation = new Float32Array(toBuffer, outBase + outBytesPerCenter + outBytesPerScale, 4);
            const outColor = new Uint8Array(toBuffer, outBase + outBytesPerCenter + outBytesPerScale + outBytesPerRotation, 4);

            outCenter[0] = parsedSplat[UncompressedSplatArray.OFFSET.X];
            outCenter[1] = parsedSplat[UncompressedSplatArray.OFFSET.Y];
            outCenter[2] = parsedSplat[UncompressedSplatArray.OFFSET.Z];

            outScale[0] = parsedSplat[UncompressedSplatArray.OFFSET.SCALE0];
            outScale[1] = parsedSplat[UncompressedSplatArray.OFFSET.SCALE1];
            outScale[2] = parsedSplat[UncompressedSplatArray.OFFSET.SCALE2];

            outRotation[0] = parsedSplat[UncompressedSplatArray.OFFSET.ROTATION0];
            outRotation[1] = parsedSplat[UncompressedSplatArray.OFFSET.ROTATION1];
            outRotation[2] = parsedSplat[UncompressedSplatArray.OFFSET.ROTATION2];
            outRotation[3] = parsedSplat[UncompressedSplatArray.OFFSET.ROTATION3];

            outColor[0] = parsedSplat[UncompressedSplatArray.OFFSET.FDC0];
            outColor[1] = parsedSplat[UncompressedSplatArray.OFFSET.FDC1];
            outColor[2] = parsedSplat[UncompressedSplatArray.OFFSET.FDC2];
            outColor[3] = parsedSplat[UncompressedSplatArray.OFFSET.OPACITY];

            if (outSphericalHarmonicsDegree >= 1) {
                const outSphericalHarmonics = new Float32Array(toBuffer, outBase + outBytesPerCenter + outBytesPerScale +
                                                               outBytesPerRotation + outBytesPerColor,
                                                               sphericalHarmonicsCount);
                for (let i = 0; i <= 8; i++) {
                    outSphericalHarmonics[i] = parsedSplat[UncompressedSplatArray.OFFSET.FRC0 + i];
                }
                if (outSphericalHarmonicsDegree >= 2) {
                    for (let i = 9; i <= 23; i++) {
                        outSphericalHarmonics[i] = parsedSplat[UncompressedSplatArray.OFFSET.FRC0 + i];
                    }
                }
            }
        }
    }

    decodeSectionSplatData(sectionSplatData, splatCount, sectionHeader, outSphericalHarmonicsDegree) {
        outSphericalHarmonicsDegree = Math.min(outSphericalHarmonicsDegree, sectionHeader.sphericalHarmonicsDegree);
        const splatArray = new UncompressedSplatArray(outSphericalHarmonicsDegree);
        for (let row = 0; row < splatCount; row++) {
            const newSplat = INRIAV1PlyParser.parseToUncompressedSplat(sectionSplatData, row, sectionHeader,
                                                                       0, outSphericalHarmonicsDegree);
            splatArray.addSplat(newSplat);
        }
        return splatArray;
    }

    static parseToUncompressedSplat = function() {

        let rawSplat = [];
        const tempRotation = new THREE.Quaternion();

        const OFFSET_X = UncompressedSplatArray.OFFSET.X;
        const OFFSET_Y = UncompressedSplatArray.OFFSET.Y;
        const OFFSET_Z = UncompressedSplatArray.OFFSET.Z;

        const OFFSET_SCALE0 = UncompressedSplatArray.OFFSET.SCALE0;
        const OFFSET_SCALE1 = UncompressedSplatArray.OFFSET.SCALE1;
        const OFFSET_SCALE2 = UncompressedSplatArray.OFFSET.SCALE2;

        const OFFSET_ROTATION0 = UncompressedSplatArray.OFFSET.ROTATION0;
        const OFFSET_ROTATION1 = UncompressedSplatArray.OFFSET.ROTATION1;
        const OFFSET_ROTATION2 = UncompressedSplatArray.OFFSET.ROTATION2;
        const OFFSET_ROTATION3 = UncompressedSplatArray.OFFSET.ROTATION3;

        const OFFSET_FDC0 = UncompressedSplatArray.OFFSET.FDC0;
        const OFFSET_FDC1 = UncompressedSplatArray.OFFSET.FDC1;
        const OFFSET_FDC2 = UncompressedSplatArray.OFFSET.FDC2;
        const OFFSET_OPACITY = UncompressedSplatArray.OFFSET.OPACITY;

        const OFFSET_FRC = [];

        for (let i = 0; i < 45; i++) {
            OFFSET_FRC[i] = UncompressedSplatArray.OFFSET.FRC0 + i;
        }

        return function(splatData, row, header, splatDataOffset = 0, outSphericalHarmonicsDegree = 0) {
            outSphericalHarmonicsDegree = Math.min(outSphericalHarmonicsDegree, header.sphericalHarmonicsDegree);
            INRIAV1PlyParser.readSplat(splatData, header, row, splatDataOffset, rawSplat);
            const newSplat = UncompressedSplatArray.createSplat(outSphericalHarmonicsDegree);
            if (rawSplat[SCALE_0] !== undefined) {
                newSplat[OFFSET_SCALE0] = Math.exp(rawSplat[SCALE_0]);
                newSplat[OFFSET_SCALE1] = Math.exp(rawSplat[SCALE_1]);
                newSplat[OFFSET_SCALE2] = Math.exp(rawSplat[SCALE_2]);
            } else {
                newSplat[OFFSET_SCALE0] = 0.01;
                newSplat[OFFSET_SCALE1] = 0.01;
                newSplat[OFFSET_SCALE2] = 0.01;
            }

            if (rawSplat[F_DC_0] !== undefined) {
                const SH_C0 = 0.28209479177387814;
                newSplat[OFFSET_FDC0] = (0.5 + SH_C0 * rawSplat[F_DC_0]) * 255;
                newSplat[OFFSET_FDC1] = (0.5 + SH_C0 * rawSplat[F_DC_1]) * 255;
                newSplat[OFFSET_FDC2] = (0.5 + SH_C0 * rawSplat[F_DC_2]) * 255;
            } else if (rawSplat[RED] !== undefined) {
                newSplat[OFFSET_FDC0] = rawSplat[RED] * 255;
                newSplat[OFFSET_FDC1] = rawSplat[GREEN] * 255;
                newSplat[OFFSET_FDC2] = rawSplat[BLUE] * 255;
            } else {
                newSplat[OFFSET_FDC0] = 0;
                newSplat[OFFSET_FDC1] = 0;
                newSplat[OFFSET_FDC2] = 0;
            }

            if (rawSplat[OPACITY] !== undefined) {
                newSplat[OFFSET_OPACITY] = (1 / (1 + Math.exp(-rawSplat[OPACITY]))) * 255;
            }

            newSplat[OFFSET_FDC0] = clamp(Math.floor(newSplat[OFFSET_FDC0]), 0, 255);
            newSplat[OFFSET_FDC1] = clamp(Math.floor(newSplat[OFFSET_FDC1]), 0, 255);
            newSplat[OFFSET_FDC2] = clamp(Math.floor(newSplat[OFFSET_FDC2]), 0, 255);
            newSplat[OFFSET_OPACITY] = clamp(Math.floor(newSplat[OFFSET_OPACITY]), 0, 255);

            if (outSphericalHarmonicsDegree >= 1) {
                if (rawSplat[F_REST_0] !== undefined) {
                    for (let i = 0; i < 9; i++) {
                        newSplat[OFFSET_FRC[i]] = rawSplat[header.sphericalHarmonicsDegree1Fields[i]];
                    }
                    if (outSphericalHarmonicsDegree >= 2) {
                        for (let i = 0; i < 15; i++) {
                            newSplat[OFFSET_FRC[9 + i]] = rawSplat[header.sphericalHarmonicsDegree2Fields[i]];
                        }
                    }
                }
            }

            tempRotation.set(rawSplat[ROT_0], rawSplat[ROT_1], rawSplat[ROT_2], rawSplat[ROT_3]);
            tempRotation.normalize();

            newSplat[OFFSET_ROTATION0] = tempRotation.x;
            newSplat[OFFSET_ROTATION1] = tempRotation.y;
            newSplat[OFFSET_ROTATION2] = tempRotation.z;
            newSplat[OFFSET_ROTATION3] = tempRotation.w;

            newSplat[OFFSET_X] = rawSplat[X];
            newSplat[OFFSET_Y] = rawSplat[Y];
            newSplat[OFFSET_Z] = rawSplat[Z];

            return newSplat;
        };

    }();

    static readSplat(splatData, header, row, dataOffset, rawSplat) {
        return PlyParserUtils.readVertex(splatData, header, row, dataOffset, FieldsToReadIndexes, rawSplat, true);
    }

    parseToUncompressedSplatArray(plyBuffer, outSphericalHarmonicsDegree = 0) {
        const header = this.decodeHeaderFromBuffer(plyBuffer);
        const splatCount = header.splatCount;
        const splatData = this.findSplatData(plyBuffer, header);
        const splatArray = this.decodeSectionSplatData(splatData, splatCount, header, outSphericalHarmonicsDegree);
        return splatArray;
    }
}
